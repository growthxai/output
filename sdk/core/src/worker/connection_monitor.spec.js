import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TemporalConnectionMonitor } from './connection_monitor.js';

const SERVING = 1;
const NOT_SERVING = 2;
const CHECK_TIMEOUT_MS = 50;
const CHECK_INTERVAL_MS = 100;

const { scheduledDelays, delayMock, mockLogger } = vi.hoisted( () => {
  const scheduledDelays = [];
  const delayMock = vi.fn( ( ms, value, options ) => new Promise( resolve => {
    scheduledDelays.push( { ms, value, options, resolve } );
  } ) );

  return {
    scheduledDelays,
    delayMock,
    mockLogger: {
      info: vi.fn(),
      warn: vi.fn()
    }
  };
} );

vi.mock( 'node:timers/promises', () => ( { setTimeout: delayMock } ) );
vi.mock( '#logger', () => ( { createChildLogger: vi.fn( () => mockLogger ) } ) );

const createConnection = check => ( {
  healthService: { check }
} );

const createMonitor = ( check, overrides = {} ) => new TemporalConnectionMonitor( createConnection( check ), {
  checkIntervalMs: CHECK_INTERVAL_MS,
  checkTimeoutMs: CHECK_TIMEOUT_MS,
  ...overrides
} );

const flushPromises = async () => Array
  .from( { length: 10 } )
  .reduce( promise => promise.then( () => Promise.resolve() ), Promise.resolve() );

const resolveNextDelay = ms => {
  const index = scheduledDelays.findIndex( delay => delay.ms === ms );
  expect( index ).not.toBe( -1 );
  const [ scheduled ] = scheduledDelays.splice( index, 1 );
  scheduled.resolve( scheduled.value );
};

describe( 'TemporalConnectionMonitor', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    scheduledDelays.length = 0;
  } );

  it( 'logs healthy when the connection is serving', async () => {
    const check = vi.fn().mockResolvedValue( { status: SERVING } );
    const monitor = createMonitor( check );

    const run = monitor.start();
    await flushPromises();

    expect( check ).toHaveBeenCalledWith( {} );
    expect( mockLogger.info ).toHaveBeenCalledWith( 'Healthy' );
    expect( delayMock ).toHaveBeenCalledWith( CHECK_TIMEOUT_MS, 0, { ref: false } );
    expect( delayMock ).toHaveBeenCalledWith( CHECK_INTERVAL_MS, 0, { ref: false } );
    expect( monitor.running ).toBe( true );

    await monitor.stop();
    await run;

    expect( monitor.running ).toBe( false );
  } );

  it( 'logs transient timeout failures before retrying', async () => {
    const check = vi.fn().mockReturnValue( new Promise( () => {} ) );
    const monitor = createMonitor( check );

    monitor.start();
    resolveNextDelay( CHECK_TIMEOUT_MS );
    await flushPromises();

    expect( mockLogger.warn ).toHaveBeenCalledWith( 'Connection unhealthy', {
      error: 'Connection health check timed out',
      failures: 1
    } );

    await monitor.stop();
  } );

  it( 'logs recovered after a transient failure succeeds', async () => {
    const check = vi.fn()
      .mockRejectedValueOnce( new Error( 'temporary outage' ) )
      .mockResolvedValueOnce( { status: SERVING } );
    const monitor = createMonitor( check );

    monitor.start();
    await flushPromises();

    expect( mockLogger.warn ).toHaveBeenCalledWith( 'Connection unhealthy', {
      error: 'temporary outage',
      failures: 1
    } );

    resolveNextDelay( CHECK_INTERVAL_MS );
    await flushPromises();

    expect( mockLogger.info ).toHaveBeenCalledWith( 'Recovered' );

    await monitor.stop();
  } );

  it( 'stores connection loss error and calls callback after max consecutive failures', async () => {
    const error = new Error( 'connection refused' );
    const check = vi.fn().mockRejectedValue( error );
    const connectionLost = vi.fn();
    const monitor = createMonitor( check );

    monitor.onConnectionLost( connectionLost );
    monitor.start();

    await flushPromises();
    resolveNextDelay( CHECK_INTERVAL_MS );
    await flushPromises();
    resolveNextDelay( CHECK_INTERVAL_MS );
    await flushPromises();

    expect( mockLogger.warn ).toHaveBeenCalledTimes( 3 );
    expect( mockLogger.warn ).toHaveBeenCalledWith( 'Connection lost', {
      error: 'connection refused',
      failures: 3
    } );
    expect( connectionLost ).toHaveBeenCalledWith( error );
    expect( monitor.connectionLossError ).toBe( error );
    expect( monitor.running ).toBe( false );
  } );

  it( 'treats non-serving health status as a failure', async () => {
    const check = vi.fn().mockResolvedValue( { status: NOT_SERVING } );
    const monitor = createMonitor( check );

    monitor.start();
    await flushPromises();

    expect( mockLogger.warn ).toHaveBeenCalledWith( 'Connection unhealthy', {
      error: `Connection not serving (status ${NOT_SERVING})`,
      failures: 1
    } );

    await monitor.stop();
  } );

  it( 'returns the same lifecycle promise when started more than once', async () => {
    const check = vi.fn().mockReturnValue( new Promise( () => {} ) );
    const monitor = createMonitor( check );

    const firstRun = monitor.start();
    const secondRun = monitor.start();

    expect( secondRun ).toBe( firstRun );
    expect( check ).toHaveBeenCalledOnce();

    await monitor.stop();
  } );

  it( 'stops without calling connection lost callback for in-flight health checks', async () => {
    const check = vi.fn().mockReturnValue( new Promise( () => {} ) );
    const connectionLost = vi.fn();
    const monitor = createMonitor( check, { maxFailures: 1 } );

    monitor.onConnectionLost( connectionLost );
    monitor.start();

    expect( monitor.running ).toBe( true );

    await monitor.stop();

    expect( connectionLost ).not.toHaveBeenCalled();
    expect( monitor.connectionLossError ).toBeNull();
    expect( monitor.running ).toBe( false );
  } );

  it( 'applies timing and failure threshold overrides', async () => {
    const error = new Error( 'fast failure' );
    const check = vi.fn().mockRejectedValue( error );
    const connectionLost = vi.fn();
    const monitor = createMonitor( check, {
      maxFailures: 1,
      checkIntervalMs: 7,
      checkTimeoutMs: 3
    } );

    monitor.onConnectionLost( connectionLost );
    await monitor.start();

    expect( delayMock ).toHaveBeenCalledWith( 3, 0, { ref: false } );
    expect( delayMock ).not.toHaveBeenCalledWith( 7, 0, { ref: false } );
    expect( connectionLost ).toHaveBeenCalledWith( error );
  } );
} );
