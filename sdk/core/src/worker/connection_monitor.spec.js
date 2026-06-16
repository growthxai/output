import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupConnectionMonitor } from './connection_monitor.js';

const SERVING = 1;
const NOT_SERVING = 2;
const CHECK_TIMEOUT_MS = 5_000;
const CHECK_INTERVAL_MS = 30_000;

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

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const resolveNextDelay = ms => {
  const index = scheduledDelays.findIndex( delay => delay.ms === ms );
  expect( index ).not.toBe( -1 );
  const [ scheduled ] = scheduledDelays.splice( index, 1 );
  scheduled.resolve( scheduled.value );
};

describe( 'worker/connection_monitor', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    scheduledDelays.length = 0;
  } );

  it( 'logs healthy when the connection is serving', async () => {
    const check = vi.fn().mockResolvedValue( { status: SERVING } );

    setupConnectionMonitor( { connection: createConnection( check ) } );
    await flushPromises();

    expect( check ).toHaveBeenCalledWith( {} );
    expect( mockLogger.info ).toHaveBeenCalledWith( 'Healthy' );
    expect( delayMock ).toHaveBeenCalledWith( CHECK_TIMEOUT_MS, 0, { ref: false } );
    expect( delayMock ).toHaveBeenCalledWith( CHECK_INTERVAL_MS, 0, { ref: false } );
  } );

  it( 'logs transient timeout failures before retrying', async () => {
    const check = vi.fn().mockReturnValue( new Promise( () => {} ) );

    setupConnectionMonitor( { connection: createConnection( check ) } );
    resolveNextDelay( CHECK_TIMEOUT_MS );
    await flushPromises();

    expect( mockLogger.warn ).toHaveBeenCalledWith( 'Connection unhealthy', {
      error: 'Connection health check timed out',
      failures: 1
    } );
  } );

  it( 'logs recovered after a transient failure succeeds', async () => {
    const check = vi.fn()
      .mockRejectedValueOnce( new Error( 'temporary outage' ) )
      .mockResolvedValueOnce( { status: SERVING } );

    setupConnectionMonitor( { connection: createConnection( check ) } );
    await flushPromises();

    expect( mockLogger.warn ).toHaveBeenCalledWith( 'Connection unhealthy', {
      error: 'temporary outage',
      failures: 1
    } );

    resolveNextDelay( CHECK_INTERVAL_MS );
    await flushPromises();

    expect( mockLogger.info ).toHaveBeenCalledWith( 'Recovered' );
  } );

  it( 'rejects after max consecutive failures', async () => {
    const error = new Error( 'connection refused' );
    const check = vi.fn().mockRejectedValue( error );
    const run = setupConnectionMonitor( { connection: createConnection( check ) } );
    const rejection = run.catch( e => e );

    await flushPromises();
    resolveNextDelay( CHECK_INTERVAL_MS );
    await flushPromises();
    resolveNextDelay( CHECK_INTERVAL_MS );
    await flushPromises();

    expect( await rejection ).toBe( error );
    expect( mockLogger.warn ).toHaveBeenCalledTimes( 2 );
  } );

  it( 'treats non-serving health status as a failure', async () => {
    const check = vi.fn().mockResolvedValue( { status: NOT_SERVING } );

    setupConnectionMonitor( { connection: createConnection( check ) } );
    await flushPromises();

    expect( mockLogger.warn ).toHaveBeenCalledWith( 'Connection unhealthy', {
      error: `Connection not serving (status ${NOT_SERVING})`,
      failures: 1
    } );
  } );
} );
