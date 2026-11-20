import { describe, expect, it } from 'vitest';
import { CancelableRunner } from './cancelable_runner.js';

/** Concrete runner that records the signal and settles when told to. */
class TestRunner extends CancelableRunner {
  #deferred = Promise.withResolvers();
  signals = [];

  async run( signal ) {
    this.signals.push( signal );
    signal.addEventListener( 'abort', () => this.#deferred.resolve(), { once: true } );
    return this.#deferred.promise;
  }

  resolve( value ) {
    this.#deferred.resolve( value );
  }

  reject( error ) {
    this.#deferred.reject( error );
  }
}

/** Runner that finishes immediately. */
class ImmediateRunner extends CancelableRunner {
  #result;

  constructor( options, result ) {
    super( options );
    this.#result = result;
  }

  async run() {
    return this.#result;
  }
}

/** Runner that rejects immediately. */
class RejectingRunner extends CancelableRunner {
  #error;

  constructor( options, error ) {
    super( options );
    this.#error = error;
  }

  async run() {
    throw this.#error;
  }
}

const flushPromises = async () => Array
  .from( { length: 10 } )
  .reduce( promise => promise.then( () => Promise.resolve() ), Promise.resolve() );

describe( 'CancelableRunner', () => {
  it( 'reports running until the work settles', async () => {
    const runner = new TestRunner( { signal: new AbortController().signal } );

    const execution = runner.start();
    await flushPromises();

    expect( runner.running ).toBe( true );

    runner.resolve();
    await execution;

    expect( runner.running ).toBe( false );
  } );

  it( 'returns the same execution when started more than once', async () => {
    const runner = new TestRunner( { signal: new AbortController().signal } );

    const first = runner.start();
    const second = runner.start();

    expect( second ).toBe( first );
    expect( runner.signals ).toHaveLength( 1 );

    runner.resolve();
    await first;
  } );

  it( 'never runs when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const runner = new TestRunner( { signal: controller.signal } );

    await expect( runner.start() ).resolves.toBeUndefined();

    expect( runner.signals ).toHaveLength( 0 );
    expect( runner.running ).toBe( false );
  } );

  it( 'never runs when stopped before starting', async () => {
    const runner = new TestRunner( { signal: new AbortController().signal } );

    await expect( runner.stop() ).resolves.toBeUndefined();
    await expect( runner.start() ).resolves.toBeUndefined();

    expect( runner.signals ).toHaveLength( 0 );
    expect( runner.running ).toBe( false );
  } );

  it( 'stops when the external signal aborts', async () => {
    const controller = new AbortController();
    const runner = new TestRunner( { signal: controller.signal } );

    const execution = runner.start();
    await flushPromises();

    expect( runner.running ).toBe( true );
    expect( runner.signals[0].aborted ).toBe( false );

    controller.abort();
    await execution;

    expect( runner.signals[0].aborted ).toBe( true );
    expect( runner.running ).toBe( false );
  } );

  it( 'stops on stop and waits for the work to settle', async () => {
    const runner = new TestRunner( { signal: new AbortController().signal } );

    const execution = runner.start();
    await flushPromises();

    const stopped = runner.stop();
    await expect( stopped ).resolves.toBeUndefined();
    await expect( execution ).resolves.toBeUndefined();

    expect( runner.signals[0].aborted ).toBe( true );
    expect( runner.running ).toBe( false );
  } );

  it( 'lets run abort itself without waiting', async () => {
    class SelfAbortingRunner extends CancelableRunner {
      async run( signal ) {
        this.abort();
        expect( signal.aborted ).toBe( true );
      }
    }

    const runner = new SelfAbortingRunner( { signal: new AbortController().signal } );

    await expect( runner.start() ).resolves.toBeUndefined();
    expect( runner.running ).toBe( false );
  } );

  it( 'resolves with the value returned by run', async () => {
    const runner = new ImmediateRunner( { signal: new AbortController().signal }, 'done' );

    await expect( runner.start() ).resolves.toBe( 'done' );
  } );

  it( 'rejects with the error thrown by run', async () => {
    const error = new Error( 'work failed' );
    const runner = new RejectingRunner( { signal: new AbortController().signal }, error );

    await expect( runner.start() ).rejects.toBe( error );
    expect( runner.running ).toBe( false );
  } );

  it( 'reports the failure through stop after a rejected run', async () => {
    const error = new Error( 'work failed' );
    const runner = new RejectingRunner( { signal: new AbortController().signal }, error );

    await expect( runner.start() ).rejects.toBe( error );
    await expect( runner.stop() ).rejects.toBe( error );
  } );

  it( 'throws when run is not implemented', async () => {
    const runner = new CancelableRunner( { signal: new AbortController().signal } );

    await expect( runner.start() ).rejects.toThrow( 'CancelableRunner must implement run()' );
  } );
} );
