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
  catalogPublisher: { running: true, interrupt: vi.fn().mockResolvedValue( undefined ) },
  connection: { close: vi.fn().mockResolvedValue( undefined ) }
} );

/** The registry as it looks before startup assigns anything. */
const createEmptyServices = () => ( {
  workerRunner: null,
  connectionMonitor: null,
  catalogPublisher: null,
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
    expect( services.catalogPublisher.interrupt ).toHaveBeenCalledOnce();
    expect( services.connection.close ).toHaveBeenCalledOnce();

    expect( services.workerRunner.stop.mock.invocationCallOrder[0] )
      .toBeLessThan( services.connectionMonitor.stop.mock.invocationCallOrder[0] );
    expect( services.connectionMonitor.stop.mock.invocationCallOrder[0] )
      .toBeLessThan( services.catalogPublisher.interrupt.mock.invocationCallOrder[0] );
    expect( services.catalogPublisher.interrupt.mock.invocationCallOrder[0] )
      .toBeLessThan( services.connection.close.mock.invocationCallOrder[0] );
  } );

  it( 'announces each step it takes', async () => {
    await shutdownServices( createServices() );

    expect( mockLog.info ).toHaveBeenCalledWith( 'Stopping Worker...' );
    expect( mockLog.info ).toHaveBeenCalledWith( 'Stopping Connection Monitor...' );
    expect( mockLog.info ).toHaveBeenCalledWith( 'Interrupting Catalog Publisher...' );
    expect( mockLog.info ).toHaveBeenCalledWith( 'Closing Connection...' );
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

    expect( services.catalogPublisher.interrupt ).not.toHaveBeenCalled();
    expect( mockLog.info ).not.toHaveBeenCalledWith( 'Interrupting Catalog Publisher...' );
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
    await expect( shutdownServices( createEmptyServices() ) ).resolves.toBeUndefined();

    expect( mockLog.info ).not.toHaveBeenCalled();
    expect( mockLog.warn ).not.toHaveBeenCalled();
  } );

  it( 'closes the connection when startup failed before anything else existed', async () => {
    const services = { ...createEmptyServices(), connection: { close: vi.fn().mockResolvedValue( undefined ) } };

    await shutdownServices( services );

    expect( services.connection.close ).toHaveBeenCalledOnce();
    expect( mockLog.info ).toHaveBeenCalledWith( 'Closing Connection...' );
  } );

  it( 'warns and keeps going when a service fails to stop', async () => {
    const error = new Error( 'drain failed' );
    const services = createServices();
    services.workerRunner.stop.mockRejectedValue( error );

    await expect( shutdownServices( services ) ).resolves.toBeUndefined();

    expect( serializeErrorMock ).toHaveBeenCalledWith( error );
    expect( mockLog.warn ).toHaveBeenCalledWith( 'Stopping Worker error', {
      error: { name: 'Error', message: 'drain failed' }
    } );
    expect( services.connectionMonitor.stop ).toHaveBeenCalledOnce();
    expect( services.catalogPublisher.interrupt ).toHaveBeenCalledOnce();
    expect( services.connection.close ).toHaveBeenCalledOnce();
  } );

  it( 'warns when closing the connection fails', async () => {
    const error = new Error( 'close failed' );
    const services = createServices();
    services.connection.close.mockRejectedValue( error );

    await expect( shutdownServices( services ) ).resolves.toBeUndefined();

    expect( mockLog.warn ).toHaveBeenCalledWith( 'Closing Connection error', {
      error: { name: 'Error', message: 'close failed' }
    } );
  } );
} );
