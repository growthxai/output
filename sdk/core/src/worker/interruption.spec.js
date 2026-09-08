import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const FORCE_QUIT_GRACE_MS = 1000;
const FORCE_QUIT_AFTER_FAILURE_MS = 60_000;

const { mockLog, serializeErrorMock } = vi.hoisted( () => ( {
  mockLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  serializeErrorMock: vi.fn( () => 'serialized' )
} ) );

vi.mock( '#logger', () => ( { createChildLogger: () => mockLog } ) );
vi.mock( '#helpers/error_serializer', () => ( { serializeError: serializeErrorMock } ) );

// The module keeps its attachment state at module scope, so every test needs a fresh copy.
const loadModule = async () => {
  vi.resetModules();
  return import( './interruption.js' );
};

describe( 'setupInterruptionHandler', () => {
  const handlers = {};
  const spies = {};

  beforeEach( () => {
    vi.clearAllMocks();
    Object.keys( handlers ).forEach( key => delete handlers[key] );

    spies.on = vi.spyOn( process, 'on' ).mockImplementation( ( event, handler ) => {
      handlers[event] = handler;
      return process;
    } );
    spies.exit = vi.spyOn( process, 'exit' ).mockImplementation( () => undefined );
  } );

  afterEach( () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  } );

  it( 'attaches a handler for every signal and uncaught error type', async () => {
    const { setupInterruptionHandler } = await loadModule();

    setupInterruptionHandler( new AbortController() );

    expect( Object.keys( handlers ) ).toEqual( [
      'SIGTERM',
      'SIGINT',
      'SIGUSR2',
      'uncaughtException',
      'unhandledRejection'
    ] );
  } );

  it( 'attaches once and keeps the first abort controller', async () => {
    const { setupInterruptionHandler } = await loadModule();
    const first = new AbortController();
    const second = new AbortController();

    setupInterruptionHandler( first );
    const attachedCalls = spies.on.mock.calls.length;
    setupInterruptionHandler( second );

    expect( spies.on ).toHaveBeenCalledTimes( attachedCalls );

    handlers.SIGTERM();

    expect( first.signal.aborted ).toBe( true );
    expect( second.signal.aborted ).toBe( false );
  } );

  describe( 'signals', () => {
    it( 'aborts with a kill signal error naming the signal', async () => {
      const { setupInterruptionHandler, KillSignError } = await loadModule();
      const controller = new AbortController();

      setupInterruptionHandler( controller );
      handlers.SIGTERM();

      expect( mockLog.info ).toHaveBeenCalledWith( 'Signal Received', { signal: 'SIGTERM' } );
      expect( controller.signal.reason ).toBeInstanceOf( KillSignError );
      expect( controller.signal.reason.message ).toBe( 'SIGTERM' );
      expect( spies.exit ).not.toHaveBeenCalled();
    } );

    it( 'ignores a second signal received within the grace window', async () => {
      vi.useFakeTimers();
      const { setupInterruptionHandler } = await loadModule();
      const controller = new AbortController();

      setupInterruptionHandler( controller );
      handlers.SIGINT();
      vi.advanceTimersByTime( FORCE_QUIT_GRACE_MS - 1 );
      handlers.SIGINT();

      expect( mockLog.warn ).not.toHaveBeenCalledWith( 'Force quitting...' );
      expect( spies.exit ).not.toHaveBeenCalled();
    } );

    it( 'force quits on a second signal received after the grace window', async () => {
      vi.useFakeTimers();
      const { setupInterruptionHandler } = await loadModule();
      const controller = new AbortController();

      setupInterruptionHandler( controller );
      handlers.SIGINT();
      vi.advanceTimersByTime( FORCE_QUIT_GRACE_MS + 1 );
      handlers.SIGINT();

      expect( mockLog.warn ).toHaveBeenCalledWith( 'Force quitting...' );
      expect( spies.exit ).toHaveBeenCalledWith( 1 );
    } );
  } );

  describe( 'uncaught errors', () => {
    it( 'aborts with an uncaught error wrapping the original', async () => {
      const { setupInterruptionHandler, UncaughtError } = await loadModule();
      const controller = new AbortController();
      const error = new TypeError( 'boom' );

      setupInterruptionHandler( controller );
      handlers.uncaughtException( error );

      // Recorded here because a prior abort would leave the reason handler with nothing to report.
      expect( mockLog.warn ).toHaveBeenCalledWith( 'Uncaught exception', { type: 'uncaughtException', error: 'serialized' } );
      expect( serializeErrorMock ).toHaveBeenCalledWith( error );
      expect( mockLog.error ).not.toHaveBeenCalled();
      expect( controller.signal.reason ).toBeInstanceOf( UncaughtError );
      expect( controller.signal.reason.message ).toBe( 'uncaughtException' );
      expect( controller.signal.reason.cause ).toBe( error );
    } );

    it( 'wraps non error rejection values for unhandled rejections', async () => {
      const { setupInterruptionHandler, UncaughtError } = await loadModule();
      const controller = new AbortController();

      setupInterruptionHandler( controller );
      handlers.unhandledRejection( 'not an error' );

      expect( mockLog.warn ).toHaveBeenCalledWith( 'Uncaught exception', { type: 'unhandledRejection', error: 'serialized' } );
      expect( serializeErrorMock ).toHaveBeenCalledWith( 'not an error' );
      expect( mockLog.error ).not.toHaveBeenCalled();
      expect( controller.signal.reason ).toBeInstanceOf( UncaughtError );
      expect( controller.signal.reason.message ).toBe( 'unhandledRejection' );
      expect( controller.signal.reason.cause ).toBe( 'not an error' );
    } );

    it( 'forces an exit when the shutdown outlives the watchdog', async () => {
      vi.useFakeTimers();
      const { setupInterruptionHandler } = await loadModule();

      setupInterruptionHandler( new AbortController() );
      handlers.uncaughtException( new Error( 'boom' ) );

      vi.advanceTimersByTime( FORCE_QUIT_AFTER_FAILURE_MS - 1 );

      expect( spies.exit ).not.toHaveBeenCalled();

      vi.advanceTimersByTime( 1 );

      expect( mockLog.warn ).toHaveBeenCalledWith( 'Uncaught exception handling timed out, force quitting...' );
      expect( spies.exit ).toHaveBeenCalledWith( 1 );
    } );

    it( 'keeps the watchdog from holding the process open', async () => {
      const { setupInterruptionHandler } = await loadModule();
      setupInterruptionHandler( new AbortController() );

      const timer = { unref: vi.fn() };
      const setTimeoutSpy = vi.spyOn( globalThis, 'setTimeout' ).mockReturnValue( timer );

      handlers.uncaughtException( new Error( 'boom' ) );

      expect( setTimeoutSpy ).toHaveBeenCalledWith( expect.any( Function ), FORCE_QUIT_AFTER_FAILURE_MS );
      expect( timer.unref ).toHaveBeenCalledOnce();
    } );
  } );
} );
