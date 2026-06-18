import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupInterruptionHandler } from './interruption.js';

const { mockLog } = vi.hoisted( () => ( {
  mockLog: { info: vi.fn(), warn: vi.fn() }
} ) );

vi.mock( '#logger', () => ( { createChildLogger: () => mockLog } ) );

describe( 'setupInterruptionHandler', () => {
  const onHandlers = {};
  const callback = vi.fn();
  const exitMock = vi.fn();
  const originalOn = process.on;
  const originalExit = process.exit;

  beforeEach( () => {
    vi.clearAllMocks();
    Object.keys( onHandlers ).forEach( key => delete onHandlers[key] );
    process.on = vi.fn( ( event, handler ) => {
      onHandlers[event] = handler;
    } );
    process.exit = exitMock;
  } );

  afterEach( () => {
    vi.useRealTimers();
    process.on = originalOn;
    process.exit = originalExit;
  } );

  it( 'registers SIGTERM and SIGINT handlers', () => {
    setupInterruptionHandler( callback );

    expect( process.on ).toHaveBeenCalledWith( 'SIGTERM', expect.any( Function ) );
    expect( process.on ).toHaveBeenCalledWith( 'SIGINT', expect.any( Function ) );
  } );

  it( 'logs and invokes callback on first SIGTERM', () => {
    setupInterruptionHandler( callback );

    onHandlers.SIGTERM();

    expect( mockLog.info ).toHaveBeenCalledWith( 'Signal Received', { signal: 'SIGTERM' } );
    expect( mockLog.warn ).toHaveBeenCalledWith( 'Initiating shutdown...' );
    expect( callback ).toHaveBeenCalledOnce();
    expect( exitMock ).not.toHaveBeenCalled();
  } );

  it( 'logs and invokes callback on first SIGINT', () => {
    setupInterruptionHandler( callback );

    onHandlers.SIGINT();

    expect( mockLog.info ).toHaveBeenCalledWith( 'Signal Received', { signal: 'SIGINT' } );
    expect( mockLog.warn ).toHaveBeenCalledWith( 'Initiating shutdown...' );
    expect( callback ).toHaveBeenCalledOnce();
    expect( exitMock ).not.toHaveBeenCalled();
  } );

  it( 'ignores a second signal received within the grace period', () => {
    vi.useFakeTimers();
    setupInterruptionHandler( callback );

    onHandlers.SIGTERM();
    onHandlers.SIGINT();

    expect( callback ).toHaveBeenCalledOnce();
    expect( mockLog.warn ).toHaveBeenCalledTimes( 1 );
    expect( mockLog.warn ).toHaveBeenCalledWith( 'Initiating shutdown...' );
    expect( exitMock ).not.toHaveBeenCalled();
  } );

  it( 'force quits on a second signal after the grace period', () => {
    vi.useFakeTimers();
    setupInterruptionHandler( callback );

    onHandlers.SIGTERM();
    vi.advanceTimersByTime( 1001 );
    onHandlers.SIGINT();

    expect( callback ).toHaveBeenCalledOnce();
    expect( mockLog.warn ).toHaveBeenCalledWith( 'Force quitting...' );
    expect( exitMock ).toHaveBeenCalledWith( 1 );
  } );
} );
