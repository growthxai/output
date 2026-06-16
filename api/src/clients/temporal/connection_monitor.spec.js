import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionMonitor } from './connection_monitor.js';

const SERVING = 1;
const NOT_SERVING = 2;
const HEALTH_CHECK_TIMEOUT_MS = 5_000;
const HEALTH_CHECK_INTERVAL_MS = 30_000;

const { scheduledDelays, delayMock } = vi.hoisted( () => {
  const scheduledDelays = [];
  const delayMock = vi.fn( ( ms, value, options ) => new Promise( resolve => {
    scheduledDelays.push( { ms, value, options, resolve } );
  } ) );

  return { scheduledDelays, delayMock };
} );

vi.mock( 'node:timers/promises', () => ( { setTimeout: delayMock } ) );

const createMonitor = check => new ConnectionMonitor( {
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

describe( 'ConnectionMonitor', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    scheduledDelays.length = 0;
  } );

  it( 'reports heartbeat when the connection is serving', async () => {
    const check = vi.fn().mockResolvedValue( { status: SERVING } );
    const heartbeat = vi.fn();
    const monitor = createMonitor( check );

    monitor.onHeartbeat( heartbeat );
    monitor.start();
    await flushPromises();

    expect( check ).toHaveBeenCalledWith( {} );
    expect( heartbeat ).toHaveBeenCalledOnce();
    expect( monitor.failing ).toBe( false );
    expect( delayMock ).toHaveBeenCalledWith( HEALTH_CHECK_TIMEOUT_MS, 0, { ref: false } );
    expect( delayMock ).toHaveBeenCalledWith( HEALTH_CHECK_INTERVAL_MS, 0, { ref: false } );
  } );

  it( 'marks the monitor unhealthy when the health check times out', async () => {
    const check = vi.fn().mockReturnValue( new Promise( () => {} ) );
    const unhealthy = vi.fn();
    const monitor = createMonitor( check );

    monitor.onUnhealthy( unhealthy );
    monitor.start();
    resolveNextDelay( HEALTH_CHECK_TIMEOUT_MS );
    await flushPromises();

    expect( unhealthy ).toHaveBeenCalledWith( {
      error: expect.objectContaining( { message: 'Connection health check timeout' } ),
      failures: 1
    } );
    expect( monitor.failing ).toBe( true );
  } );

  it( 'reports recovery after a transient failure', async () => {
    const check = vi.fn()
      .mockRejectedValueOnce( new Error( 'temporary outage' ) )
      .mockResolvedValueOnce( { status: SERVING } );
    const unhealthy = vi.fn();
    const recover = vi.fn();
    const heartbeat = vi.fn();
    const monitor = createMonitor( check );

    monitor.onUnhealthy( unhealthy );
    monitor.onRecover( recover );
    monitor.onHeartbeat( heartbeat );
    monitor.start();

    await flushPromises();
    expect( unhealthy ).toHaveBeenCalledWith( {
      error: expect.objectContaining( { message: 'temporary outage' } ),
      failures: 1
    } );
    expect( monitor.failing ).toBe( true );

    resolveNextDelay( HEALTH_CHECK_INTERVAL_MS );
    await flushPromises();

    expect( recover ).toHaveBeenCalledOnce();
    expect( heartbeat ).not.toHaveBeenCalled();
    expect( monitor.failing ).toBe( false );
  } );

  it( 'calls the connection lost handler after max consecutive failures', async () => {
    const error = new Error( 'connection refused' );
    const check = vi.fn().mockRejectedValue( error );
    const unhealthy = vi.fn();
    const connectionLost = vi.fn( cause => {
      throw cause;
    } );
    const monitor = createMonitor( check );

    monitor.onUnhealthy( unhealthy );
    monitor.onConnectionLost( connectionLost );
    const run = monitor.start();
    const rejection = run.catch( e => e );

    await flushPromises();
    resolveNextDelay( HEALTH_CHECK_INTERVAL_MS );
    await flushPromises();
    resolveNextDelay( HEALTH_CHECK_INTERVAL_MS );
    await flushPromises();

    expect( await rejection ).toBe( error );
    expect( unhealthy ).toHaveBeenCalledTimes( 2 );
    expect( connectionLost ).toHaveBeenCalledWith( error );
    expect( monitor.failing ).toBe( true );
  } );

  it( 'treats non-serving health status as a failure', async () => {
    const check = vi.fn().mockResolvedValue( { status: NOT_SERVING } );
    const unhealthy = vi.fn();
    const monitor = createMonitor( check );

    monitor.onUnhealthy( unhealthy );
    monitor.start();
    await flushPromises();

    expect( unhealthy ).toHaveBeenCalledWith( {
      error: expect.objectContaining( { message: `Connection not serving (status ${NOT_SERVING})` } ),
      failures: 1
    } );
    expect( monitor.failing ).toBe( true );
  } );
} );
