import { describe, expect, it, vi } from 'vitest';
import { WorkerRunner } from './worker_runner.js';

/**
 * Stands in for a Temporal worker: run() only settles once the drain finishes,
 * and shutdown() moves the run state out of RUNNING the way the SDK does.
 */
const createWorker = () => {
  const state = { runState: 'INITIALIZED', resolve: null, reject: null };

  const worker = {
    run: vi.fn( () => {
      state.runState = 'RUNNING';
      return new Promise( ( resolve, reject ) => {
        state.resolve = resolve;
        state.reject = reject;
      } );
    } ),
    shutdown: vi.fn( () => {
      state.runState = 'STOPPING';
    } ),
    getStatus: vi.fn( () => ( { runState: state.runState } ) )
  };

  return {
    worker,
    drain: () => {
      state.runState = 'STOPPED';
      state.resolve();
    },
    fail: error => {
      state.runState = 'STOPPED';
      state.reject( error );
    }
  };
};

const createRunner = ( worker, signal = new AbortController().signal ) => new WorkerRunner( { worker, signal } );

describe( 'WorkerRunner', () => {
  it( 'polls the task queue and reports running until the worker settles', async () => {
    const { worker, drain } = createWorker();
    const runner = createRunner( worker );

    const run = runner.start();

    expect( worker.run ).toHaveBeenCalledOnce();
    expect( runner.running ).toBe( true );

    drain();
    await run;

    expect( runner.running ).toBe( false );
  } );

  it( 'returns the same execution when started more than once', async () => {
    const { worker, drain } = createWorker();
    const runner = createRunner( worker );

    const first = runner.start();
    const second = runner.start();

    expect( second ).toBe( first );
    expect( worker.run ).toHaveBeenCalledOnce();

    drain();
    await first;
  } );

  it( 'never polls when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const { worker } = createWorker();
    const runner = createRunner( worker, controller.signal );

    await expect( runner.start() ).resolves.toBeUndefined();

    expect( worker.run ).not.toHaveBeenCalled();
    expect( worker.shutdown ).not.toHaveBeenCalled();
    expect( runner.running ).toBe( false );
  } );

  it( 'drains the worker when the signal aborts', async () => {
    const controller = new AbortController();
    const { worker, drain } = createWorker();
    const runner = createRunner( worker, controller.signal );

    const run = runner.start();
    controller.abort();

    expect( worker.shutdown ).toHaveBeenCalledOnce();
    expect( runner.running ).toBe( true );

    drain();
    await run;

    expect( runner.running ).toBe( false );
  } );

  it( 'drains on stop and resolves once the worker settles', async () => {
    const { worker, drain } = createWorker();
    const runner = createRunner( worker );

    const run = runner.start();
    const stopped = runner.stop();

    expect( worker.shutdown ).toHaveBeenCalledOnce();
    expect( runner.running ).toBe( true );

    drain();

    await expect( stopped ).resolves.toBeUndefined();
    await run;

    expect( runner.running ).toBe( false );
  } );

  it( 'does not shut down a worker that is not running', async () => {
    const { worker } = createWorker();
    const runner = createRunner( worker );

    await expect( runner.stop() ).resolves.toBeUndefined();

    expect( worker.run ).not.toHaveBeenCalled();
    expect( worker.shutdown ).not.toHaveBeenCalled();
  } );

  it( 'shuts the worker down once when stopped twice', async () => {
    const { worker, drain } = createWorker();
    const runner = createRunner( worker );

    const run = runner.start();
    runner.stop();
    runner.stop();

    expect( worker.shutdown ).toHaveBeenCalledOnce();

    drain();
    await run;
  } );

  it( 'shuts the worker down once when aborted and then stopped', async () => {
    const controller = new AbortController();
    const { worker, drain } = createWorker();
    const runner = createRunner( worker, controller.signal );

    const run = runner.start();
    controller.abort();
    const stopped = runner.stop();

    expect( worker.shutdown ).toHaveBeenCalledOnce();

    drain();

    await expect( stopped ).resolves.toBeUndefined();
    await run;
  } );

  it( 'rejects when the worker fails', async () => {
    const error = new Error( 'poll failed' );
    const { worker, fail } = createWorker();
    const runner = createRunner( worker );

    const run = runner.start();
    const rejection = expect( run ).rejects.toBe( error );

    fail( error );
    await rejection;

    expect( runner.running ).toBe( false );
  } );

  it( 'reports the failure through stop so a drain error is never silent', async () => {
    const error = new Error( 'poll failed' );
    const { worker, fail } = createWorker();
    const runner = createRunner( worker );

    const run = runner.start();
    const rejection = expect( run ).rejects.toBe( error );

    fail( error );
    await rejection;

    await expect( runner.stop() ).rejects.toBe( error );
    expect( worker.shutdown ).not.toHaveBeenCalled();
  } );

  it( 'reports a drain that fails after stop was called', async () => {
    const error = new Error( 'drain failed' );
    const { worker, fail } = createWorker();
    const runner = createRunner( worker );

    const run = runner.start();
    const rejection = expect( run ).rejects.toBe( error );
    const stopped = runner.stop();

    fail( error );

    await expect( stopped ).rejects.toBe( error );
    await rejection;
  } );
} );
