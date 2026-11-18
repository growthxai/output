import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionMonitor } from './connection_monitor.js';

const MAX_FAILURES = 3;
const CHECK_INTERVAL_MS = 10;
const CHECK_TIMEOUT_MS = 5;
const CONNECTION_MONITOR_OVERRIDES = {
  maxFailures: MAX_FAILURES,
  checkIntervalMs: CHECK_INTERVAL_MS,
  checkTimeoutMs: CHECK_TIMEOUT_MS
};

const { deadlineError, scheduledDelays, delayMock } = vi.hoisted( () => {
  const scheduledDelays = [];
  const delayMock = vi.fn( ( ms, value, options ) => new Promise( resolve => {
    scheduledDelays.push( { ms, value, options, resolve } );
  } ) );

  return { deadlineError: new Error( 'Deadline exceeded' ), scheduledDelays, delayMock };
} );

vi.mock( 'node:timers/promises', () => ( { setTimeout: delayMock } ) );
vi.mock( '@temporalio/client', () => ( { isGrpcDeadlineError: error => error === deadlineError } ) );

const createMonitor = check => {
  const connection = {
    workflowService: { getSystemInfo: check },
    withDeadline: vi.fn( ( _deadline, fn ) => fn() )
  };

  return {
    connection,
    monitor: new ConnectionMonitor( connection, CONNECTION_MONITOR_OVERRIDES )
  };
};

const flushPromises = async () => {
  await Array
    .from( { length: 10 } )
    .reduce( promise => promise.then( () => Promise.resolve() ), Promise.resolve() );
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

  it( 'reports heartbeat when the workflow service is reachable', async () => {
    const check = vi.fn().mockResolvedValue( {} );
    const heartbeat = vi.fn();
    const { connection, monitor } = createMonitor( check );

    monitor.onHeartbeat( heartbeat );
    monitor.start();
    await flushPromises();

    expect( connection.withDeadline ).toHaveBeenCalledWith( expect.any( Number ), expect.any( Function ) );
    expect( check ).toHaveBeenCalledWith( {} );
    expect( heartbeat ).toHaveBeenCalledOnce();
    expect( monitor.failing ).toBe( false );
    expect( delayMock ).toHaveBeenCalledWith( CHECK_INTERVAL_MS, 0, { ref: false } );
  } );

  it( 'marks the monitor unhealthy when the health check times out', async () => {
    const check = vi.fn().mockRejectedValue( deadlineError );
    const unhealthy = vi.fn();
    const { monitor } = createMonitor( check );

    monitor.onUnhealthy( unhealthy );
    monitor.start();
    await flushPromises();

    expect( unhealthy ).toHaveBeenCalledWith( {
      error: expect.objectContaining( { message: 'Connection health check timed out' } ),
      failures: 1
    } );
    expect( monitor.failing ).toBe( true );
  } );

  it( 'reports recovery after a transient failure', async () => {
    const check = vi.fn()
      .mockRejectedValueOnce( new Error( 'temporary outage' ) )
      .mockResolvedValueOnce( {} );
    const unhealthy = vi.fn();
    const recover = vi.fn();
    const heartbeat = vi.fn();
    const { monitor } = createMonitor( check );

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

    resolveNextDelay( CHECK_INTERVAL_MS );
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
    const { monitor } = createMonitor( check );

    monitor.onUnhealthy( unhealthy );
    monitor.onConnectionLost( connectionLost );
    const run = monitor.start();
    const rejection = run.catch( e => e );

    await flushPromises();
    resolveNextDelay( CHECK_INTERVAL_MS );
    await flushPromises();
    resolveNextDelay( CHECK_INTERVAL_MS );
    await flushPromises();

    expect( await rejection ).toBe( error );
    expect( unhealthy ).toHaveBeenCalledTimes( MAX_FAILURES - 1 );
    expect( connectionLost ).toHaveBeenCalledWith( error );
    expect( monitor.failing ).toBe( true );
  } );

} );
