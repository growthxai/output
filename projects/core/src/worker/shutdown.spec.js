import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shutdownServices } from './shutdown.js';

const { mockLog, serializeErrorMock } = vi.hoisted( () => ( {
  mockLog: { info: vi.fn(), warn: vi.fn() },
  serializeErrorMock: vi.fn( error => ( { name: error.name, message: error.message } ) )
} ) );

vi.mock( '#logger', () => ( { createChildLogger: () => mockLog } ) );
vi.mock( '#helpers/error_serializer', () => ( { serializeError: serializeErrorMock } ) );

/** Stands in for the services registry built during startup, with every service active. */
const createServices = () => ( {
  workerRunner: { running: true, stop: vi.fn().mockResolvedValue( undefined ) },
  connectionMonitor: { running: true, stop: vi.fn().mockResolvedValue( undefined ) },
  catalogPublisher: { running: true, stop: vi.fn().mockResolvedValue( undefined ) },
  llmPricingRetriever: { running: true, stop: vi.fn().mockResolvedValue( undefined ) },
  connection: { close: vi.fn().mockResolvedValue( undefined ) }
} );

/** The registry as it looks before startup assigns anything. */
const createEmptyServices = () => ( {
  workerRunner: null,
  connectionMonitor: null,
  catalogPublisher: null,
  llmPricingRetriever: null,
  connection: null
} );

describe( 'shutdownServices', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'stops every active service, worker first and connection last', async () => {
    const services = createServices();

    await shutdownServices( services );

    expect( services.workerRunner.stop ).toHaveBeenCalledOnce();
    expect( services.connectionMonitor.stop ).toHaveBeenCalledOnce();
    expect( services.catalogPublisher.stop ).toHaveBeenCalledOnce();
    expect( services.llmPricingRetriever.stop ).toHaveBeenCalledOnce();
    expect( services.connection.close ).toHaveBeenCalledOnce();

    expect( services.workerRunner.stop.mock.invocationCallOrder[0] )
      .toBeLessThan( services.connectionMonitor.stop.mock.invocationCallOrder[0] );
    expect( services.connectionMonitor.stop.mock.invocationCallOrder[0] )
      .toBeLessThan( services.catalogPublisher.stop.mock.invocationCallOrder[0] );
    expect( services.catalogPublisher.stop.mock.invocationCallOrder[0] )
      .toBeLessThan( services.llmPricingRetriever.stop.mock.invocationCallOrder[0] );
    expect( services.llmPricingRetriever.stop.mock.invocationCallOrder[0] )
      .toBeLessThan( services.connection.close.mock.invocationCallOrder[0] );
  } );

  it( 'announces each step it takes', async () => {
    await shutdownServices( createServices() );

    expect( mockLog.info ).toHaveBeenCalledWith( 'Stopping Worker...' );
    expect( mockLog.info ).toHaveBeenCalledWith( 'Stopping Connection Monitor...' );
    expect( mockLog.info ).toHaveBeenCalledWith( 'Stopping Catalog Publisher...' );
    expect( mockLog.info ).toHaveBeenCalledWith( 'Stopping LLM Pricing Retriever...' );
    expect( mockLog.info ).toHaveBeenCalledWith( 'Stopping Temporal Connection...' );
    expect( mockLog.warn ).not.toHaveBeenCalled();
  } );

  it( 'waits for a service to settle before stopping the next one', async () => {
    const deferred = {};
    const services = createServices();
    services.workerRunner.stop.mockReturnValue( new Promise( resolve => {
      deferred.resolve = resolve;
    } ) );

    const stopped = shutdownServices( services );
    await Promise.resolve();

    expect( services.connectionMonitor.stop ).not.toHaveBeenCalled();

    deferred.resolve();
    await stopped;

    expect( services.connectionMonitor.stop ).toHaveBeenCalledOnce();
  } );

  it( 'skips a worker runner that is no longer running', async () => {
    const services = createServices();
    services.workerRunner.running = false;

    await shutdownServices( services );

    expect( services.workerRunner.stop ).not.toHaveBeenCalled();
    expect( mockLog.info ).not.toHaveBeenCalledWith( 'Stopping Worker...' );
    expect( services.connection.close ).toHaveBeenCalledOnce();
  } );

  it( 'skips a connection monitor that already exited', async () => {
    const services = createServices();
    services.connectionMonitor.running = false;

    await shutdownServices( services );

    expect( services.connectionMonitor.stop ).not.toHaveBeenCalled();
    expect( mockLog.info ).not.toHaveBeenCalledWith( 'Stopping Connection Monitor...' );
  } );

  it( 'skips a catalog publisher that already finished', async () => {
    const services = createServices();
    services.catalogPublisher.running = false;

    await shutdownServices( services );

    expect( services.catalogPublisher.stop ).not.toHaveBeenCalled();
    expect( mockLog.info ).not.toHaveBeenCalledWith( 'Stopping Catalog Publisher...' );
  } );

  it( 'skips an llm pricing retriever that already finished', async () => {
    const services = createServices();
    services.llmPricingRetriever.running = false;

    await shutdownServices( services );

    expect( services.llmPricingRetriever.stop ).not.toHaveBeenCalled();
    expect( mockLog.info ).not.toHaveBeenCalledWith( 'Stopping LLM Pricing Retriever...' );
  } );

  it( 'reads the state at each turn, so a service stopped by an earlier step is skipped', async () => {
    const services = createServices();
    services.workerRunner.stop.mockImplementation( async () => {
      services.connectionMonitor.running = false;
    } );

    await shutdownServices( services );

    expect( services.connectionMonitor.stop ).not.toHaveBeenCalled();
    expect( services.connection.close ).toHaveBeenCalledOnce();
  } );

  it( 'does nothing when startup never built a service', async () => {
    await shutdownServices( createEmptyServices() );

    expect( mockLog.info ).not.toHaveBeenCalled();
    expect( mockLog.warn ).not.toHaveBeenCalled();
  } );

  it( 'closes the connection when startup failed before anything else existed', async () => {
    const services = { ...createEmptyServices(), connection: { close: vi.fn().mockResolvedValue( undefined ) } };

    await shutdownServices( services );

    expect( services.connection.close ).toHaveBeenCalledOnce();
    expect( mockLog.info ).toHaveBeenCalledWith( 'Stopping Temporal Connection...' );
  } );

  it( 'logs how long every service took to stop', async () => {
    await shutdownServices( createServices() );

    [
      'Worker',
      'Connection Monitor',
      'Catalog Publisher',
      'LLM Pricing Retriever',
      'Temporal Connection'
    ].forEach( name => {
      expect( mockLog.info ).toHaveBeenCalledWith( `${name} stopped`, { elapsedMs: expect.any( Number ) } );
    } );
    expect( mockLog.warn ).not.toHaveBeenCalled();
  } );

  it( 'warns and keeps going when a service fails to stop', async () => {
    const error = new Error( 'drain failed' );
    const services = createServices();
    services.workerRunner.stop.mockRejectedValue( error );

    await shutdownServices( services );

    expect( serializeErrorMock ).toHaveBeenCalledWith( error );
    expect( mockLog.warn ).toHaveBeenCalledWith( 'Worker failed to stop', {
      error: { name: 'Error', message: 'drain failed' },
      elapsedMs: expect.any( Number )
    } );
    expect( services.connectionMonitor.stop ).toHaveBeenCalledOnce();
    expect( services.catalogPublisher.stop ).toHaveBeenCalledOnce();
    expect( services.llmPricingRetriever.stop ).toHaveBeenCalledOnce();
    expect( services.connection.close ).toHaveBeenCalledOnce();
  } );

  it( 'warns when closing the connection fails', async () => {
    const error = new Error( 'close failed' );
    const services = createServices();
    services.connection.close.mockRejectedValue( error );

    await shutdownServices( services );

    expect( mockLog.warn ).toHaveBeenCalledWith( 'Temporal Connection failed to stop', {
      error: { name: 'Error', message: 'close failed' },
      elapsedMs: expect.any( Number )
    } );
  } );

  it( 'warns about a service that throws instead of rejecting', async () => {
    const error = new Error( 'shutdown blew up' );
    const services = createServices();
    services.workerRunner.stop.mockImplementation( () => {
      throw error;
    } );

    await shutdownServices( services );

    expect( mockLog.warn ).toHaveBeenCalledWith( 'Worker failed to stop', {
      error: { name: 'Error', message: 'shutdown blew up' },
      elapsedMs: expect.any( Number )
    } );
    expect( services.connection.close ).toHaveBeenCalledOnce();
  } );

  it( 'warns about every service that failed, in the order they were stopped', async () => {
    const drainError = new Error( 'drain failed' );
    const closeError = new Error( 'close failed' );
    const services = createServices();
    services.workerRunner.stop.mockRejectedValue( drainError );
    services.connection.close.mockRejectedValue( closeError );

    await shutdownServices( services );

    expect( mockLog.warn ).toHaveBeenNthCalledWith( 1, 'Worker failed to stop', expect.objectContaining( {
      error: { name: 'Error', message: 'drain failed' }
    } ) );
    expect( mockLog.warn ).toHaveBeenNthCalledWith( 2, 'Temporal Connection failed to stop', expect.objectContaining( {
      error: { name: 'Error', message: 'close failed' }
    } ) );
  } );
} );
