import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionLostError, TemporalConnectionMonitor } from './connection_monitor.js';

const CHECK_TIMEOUT_MS = 50;
const CHECK_INTERVAL_MS = 100;

const { scheduledDelays, delayMock, mockLog } = vi.hoisted( () => {
  const scheduledDelays = [];
  const abortError = () => Object.assign( new Error( 'The operation was aborted' ), { name: 'AbortError' } );

  // Mirrors node:timers/promises: rejects with an AbortError when the signal aborts, or if already aborted.
  const delayMock = vi.fn( ( ms, value, options ) => new Promise( ( resolve, reject ) => {
    const signal = options?.signal;

    if ( signal?.aborted ) {
      reject( abortError() );
      return;
    }

    scheduledDelays.push( { ms, value, options, resolve } );
    signal?.addEventListener( 'abort', () => reject( abortError() ), { once: true } );
  } ) );

  return {
    scheduledDelays,
    delayMock,
    mockLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  };
} );

vi.mock( 'node:timers/promises', () => ( { setTimeout: delayMock } ) );
vi.mock( '#logger', () => ( { createChildLogger: () => mockLog } ) );

const delayOptions = { ref: false, signal: expect.any( AbortSignal ) };

const createMonitor = ( check, overrides = {}, signal = new AbortController().signal ) =>
  new TemporalConnectionMonitor( {
    connection: { workflowService: { getSystemInfo: check } },
    signal,
    overrides: { checkIntervalMs: CHECK_INTERVAL_MS, checkTimeoutMs: CHECK_TIMEOUT_MS, ...overrides }
  } );

const flushPromises = async () => Array
  .from( { length: 10 } )
  .reduce( promise => promise.then( () => Promise.resolve() ), Promise.resolve() );

const resolveNextDelay = ms => {
  const index = scheduledDelays.findIndex( scheduled => scheduled.ms === ms );
  expect( index ).not.toBe( -1 );
  const [ scheduled ] = scheduledDelays.splice( index, 1 );
  scheduled.resolve( scheduled.value );
};

describe( 'TemporalConnectionMonitor', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    scheduledDelays.length = 0;
  } );

  describe( 'health checks', () => {
    it( 'logs healthy and schedules the next check when the workflow service is reachable', async () => {
      const check = vi.fn().mockResolvedValue( {} );
      const monitor = createMonitor( check );

      const run = monitor.start();
      await flushPromises();

      expect( check ).toHaveBeenCalledWith( {} );
      expect( mockLog.info ).toHaveBeenCalledWith( 'Healthy' );
      expect( delayMock ).toHaveBeenCalledWith( CHECK_TIMEOUT_MS, 0, delayOptions );
      expect( delayMock ).toHaveBeenCalledWith( CHECK_INTERVAL_MS, true, delayOptions );
      expect( monitor.running ).toBe( true );

      await monitor.stop();
      await run;

      expect( monitor.running ).toBe( false );
    } );

    it( 'counts a timed out check as a transient failure', async () => {
      const check = vi.fn().mockReturnValue( new Promise( () => {} ) );
      const monitor = createMonitor( check );

      const run = monitor.start();
      resolveNextDelay( CHECK_TIMEOUT_MS );
      await flushPromises();

      expect( mockLog.warn ).toHaveBeenCalledWith( 'Connection unhealthy', {
        error: 'Connection health check timed out',
        failures: 1
      } );

      await monitor.stop();
      await run;
    } );

    it( 'logs recovered without a healthy line when the first check fails', async () => {
      const check = vi.fn()
        .mockRejectedValueOnce( new Error( 'temporary outage' ) )
        .mockResolvedValue( {} );
      const monitor = createMonitor( check );

      const run = monitor.start();
      await flushPromises();

      expect( mockLog.warn ).toHaveBeenCalledWith( 'Connection unhealthy', { error: 'temporary outage', failures: 1 } );

      resolveNextDelay( CHECK_INTERVAL_MS );
      await flushPromises();

      expect( mockLog.info ).toHaveBeenCalledOnce();
      expect( mockLog.info ).toHaveBeenCalledWith( 'Recovered' );

      await monitor.stop();
      await run;
    } );

    it( 'logs healthy once while the connection stays reachable', async () => {
      const check = vi.fn().mockResolvedValue( {} );
      const monitor = createMonitor( check );

      const run = monitor.start();
      await flushPromises();
      resolveNextDelay( CHECK_INTERVAL_MS );
      await flushPromises();
      resolveNextDelay( CHECK_INTERVAL_MS );
      await flushPromises();

      expect( check ).toHaveBeenCalledTimes( 3 );
      expect( mockLog.info ).toHaveBeenCalledOnce();
      expect( mockLog.info ).toHaveBeenCalledWith( 'Healthy' );

      await monitor.stop();
      await run;
    } );

    it( 'logs recovered on a later failure without repeating healthy', async () => {
      const check = vi.fn()
        .mockResolvedValueOnce( {} )
        .mockRejectedValueOnce( new Error( 'temporary outage' ) )
        .mockResolvedValue( {} );
      const monitor = createMonitor( check );

      const run = monitor.start();
      await flushPromises();
      resolveNextDelay( CHECK_INTERVAL_MS );
      await flushPromises();
      resolveNextDelay( CHECK_INTERVAL_MS );
      await flushPromises();

      expect( mockLog.info ).toHaveBeenCalledTimes( 2 );
      expect( mockLog.info ).toHaveBeenNthCalledWith( 1, 'Healthy' );
      expect( mockLog.info ).toHaveBeenNthCalledWith( 2, 'Recovered' );

      await monitor.stop();
      await run;
    } );

    it( 'describes non error rejections with their string value', async () => {
      const check = vi.fn().mockRejectedValue( 'socket hang up' );
      const monitor = createMonitor( check, { maxFailures: 2 } );

      const run = monitor.start();
      const rejection = expect( run ).rejects.toThrow( ConnectionLostError );

      await flushPromises();
      resolveNextDelay( CHECK_INTERVAL_MS );
      await flushPromises();
      await rejection;

      expect( mockLog.warn ).toHaveBeenCalledWith( 'Connection unhealthy', { error: 'socket hang up', failures: 1 } );
      expect( mockLog.warn ).toHaveBeenCalledWith( 'Connection lost', { error: 'socket hang up', failures: 2 } );
    } );
  } );

  describe( 'connection loss', () => {
    it( 'rejects after the maximum consecutive failures', async () => {
      const check = vi.fn().mockRejectedValue( new Error( 'connection refused' ) );
      const monitor = createMonitor( check, { maxFailures: 3 } );

      const run = monitor.start();
      const rejection = expect( run ).rejects.toThrow( ConnectionLostError );

      await flushPromises();
      resolveNextDelay( CHECK_INTERVAL_MS );
      await flushPromises();
      resolveNextDelay( CHECK_INTERVAL_MS );
      await flushPromises();
      await rejection;

      expect( check ).toHaveBeenCalledTimes( 3 );
      expect( mockLog.warn ).toHaveBeenCalledTimes( 3 );
      expect( mockLog.warn ).toHaveBeenCalledWith( 'Connection lost', { error: 'connection refused', failures: 3 } );
      expect( monitor.running ).toBe( false );
    } );

    it( 'preserves the original failure as the error cause', async () => {
      const error = new Error( 'connection refused' );
      const check = vi.fn().mockRejectedValue( error );
      const monitor = createMonitor( check, { maxFailures: 1 } );

      await expect( monitor.start() ).rejects.toMatchObject( {
        name: 'ConnectionLostError',
        message: 'Connection lost',
        cause: error
      } );
    } );

    it( 'stops watching once the connection is lost', async () => {
      const check = vi.fn().mockRejectedValue( new Error( 'connection refused' ) );
      const monitor = createMonitor( check, { maxFailures: 1 } );

      await expect( monitor.start() ).rejects.toThrow( ConnectionLostError );
      await flushPromises();

      expect( check ).toHaveBeenCalledOnce();
      expect( monitor.running ).toBe( false );
    } );

    it( 'does not reject from stop after the connection was lost', async () => {
      const check = vi.fn().mockRejectedValue( new Error( 'connection refused' ) );
      const monitor = createMonitor( check, { maxFailures: 1 } );

      await expect( monitor.start() ).rejects.toThrow( ConnectionLostError );
      await expect( monitor.stop() ).resolves.toBeUndefined();
    } );
  } );

  describe( 'abort', () => {
    it( 'never checks when the signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      const check = vi.fn();
      const monitor = createMonitor( check, {}, controller.signal );

      await expect( monitor.start() ).resolves.toBeUndefined();

      expect( check ).not.toHaveBeenCalled();
      expect( monitor.running ).toBe( false );
    } );

    it( 'stops without reporting when aborted during a check', async () => {
      const controller = new AbortController();
      const check = vi.fn().mockReturnValue( new Promise( () => {} ) );
      const monitor = createMonitor( check, {}, controller.signal );

      const run = monitor.start();
      await flushPromises();

      expect( monitor.running ).toBe( true );

      controller.abort();

      await expect( run ).resolves.toBeUndefined();
      expect( mockLog.warn ).not.toHaveBeenCalled();
      expect( monitor.running ).toBe( false );
    } );

    it( 'stops without reporting when aborted between checks', async () => {
      const controller = new AbortController();
      const check = vi.fn().mockResolvedValue( {} );
      const monitor = createMonitor( check, {}, controller.signal );

      const run = monitor.start();
      await flushPromises();

      expect( mockLog.info ).toHaveBeenCalledWith( 'Healthy' );

      controller.abort();

      await expect( run ).resolves.toBeUndefined();
      expect( check ).toHaveBeenCalledOnce();
      expect( mockLog.warn ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'lifecycle', () => {
    it( 'returns the same watch when started more than once', async () => {
      const check = vi.fn().mockReturnValue( new Promise( () => {} ) );
      const monitor = createMonitor( check );

      const first = monitor.start();
      const second = monitor.start();

      expect( second ).toBe( first );
      expect( check ).toHaveBeenCalledOnce();

      await monitor.stop();
      await first;
    } );

    it( 'stops an in flight check without reporting a failure', async () => {
      const check = vi.fn().mockReturnValue( new Promise( () => {} ) );
      const monitor = createMonitor( check, { maxFailures: 1 } );

      const run = monitor.start();

      expect( monitor.running ).toBe( true );

      await monitor.stop();
      await run;

      expect( mockLog.warn ).not.toHaveBeenCalled();
      expect( monitor.running ).toBe( false );
    } );

    it( 'never watches when stopped before starting', async () => {
      const check = vi.fn();
      const monitor = createMonitor( check );

      await expect( monitor.stop() ).resolves.toBeUndefined();
      await expect( monitor.start() ).resolves.toBeUndefined();

      expect( check ).not.toHaveBeenCalled();
      expect( monitor.running ).toBe( false );
    } );

    it( 'applies the timing and failure threshold overrides', async () => {
      const check = vi.fn().mockRejectedValue( new Error( 'fast failure' ) );
      const monitor = createMonitor( check, { maxFailures: 1, checkIntervalMs: 7, checkTimeoutMs: 3 } );

      await expect( monitor.start() ).rejects.toThrow( ConnectionLostError );

      expect( delayMock ).toHaveBeenCalledWith( 3, 0, delayOptions );
      expect( delayMock ).not.toHaveBeenCalledWith( 7, true, delayOptions );
    } );
  } );
} );
