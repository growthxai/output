import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerShutdown } from './shutdown.js';

describe( 'worker/shutdown', () => {
  const mockLog = { info: vi.fn(), warn: vi.fn() };
  const shutdownMock = vi.fn();
  const mockWorker = { shutdown: shutdownMock };
  const onHandlers = {};
  const exitMock = vi.fn();
  const originalOn = process.on;
  const originalExit = process.exit;

  beforeEach( () => {
    vi.clearAllMocks();
    Object.keys( onHandlers ).forEach( k => delete onHandlers[k] );
    process.on = vi.fn( ( event, handler ) => {
      onHandlers[event] = handler;
    } );
    process.exit = exitMock;
  } );

  afterEach( () => {
    process.on = originalOn;
    process.exit = originalExit;
  } );

  it( 'registers SIGTERM and SIGINT handlers', () => {
    registerShutdown( { worker: mockWorker, log: mockLog } );

    expect( process.on ).toHaveBeenCalledWith( 'SIGTERM', expect.any( Function ) );
    expect( process.on ).toHaveBeenCalledWith( 'SIGINT', expect.any( Function ) );
  } );

  it( 'on first signal: logs, calls worker.shutdown(), does not exit', () => {
    registerShutdown( { worker: mockWorker, log: mockLog } );

    onHandlers.SIGTERM();

    expect( mockLog.info ).toHaveBeenCalledWith( 'Shutting down...', { signal: 'SIGTERM' } );
    expect( shutdownMock ).toHaveBeenCalledTimes( 1 );
    expect( mockLog.warn ).not.toHaveBeenCalled();
    expect( exitMock ).not.toHaveBeenCalled();
  } );

  it( 'on first SIGINT: logs with SIGINT', () => {
    registerShutdown( { worker: mockWorker, log: mockLog } );

    onHandlers.SIGINT();

    expect( mockLog.info ).toHaveBeenCalledWith( 'Shutting down...', { signal: 'SIGINT' } );
    expect( shutdownMock ).toHaveBeenCalledTimes( 1 );
  } );

  it( 'on second signal within grace period: ignores (no force quit)', () => {
    vi.useFakeTimers();
    registerShutdown( { worker: mockWorker, log: mockLog } );

    onHandlers.SIGTERM();
    onHandlers.SIGINT();

    expect( mockLog.info ).toHaveBeenCalledTimes( 1 );
    expect( shutdownMock ).toHaveBeenCalledTimes( 1 );
    expect( mockLog.warn ).not.toHaveBeenCalled();
    expect( exitMock ).not.toHaveBeenCalled();

    vi.useRealTimers();
  } );

  it( 'on second signal after grace period: logs force quit and exits with 1', () => {
    vi.useFakeTimers();
    registerShutdown( { worker: mockWorker, log: mockLog } );

    onHandlers.SIGTERM();
    vi.advanceTimersByTime( 1001 );
    onHandlers.SIGINT();

    expect( mockLog.warn ).toHaveBeenCalledWith( 'Force quitting...' );
    expect( exitMock ).toHaveBeenCalledWith( 1 );

    vi.useRealTimers();
  } );
} );
