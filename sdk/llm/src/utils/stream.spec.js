import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted( () => ( {
  delay: vi.fn()
} ) );

vi.mock( 'node:timers/promises', () => ( {
  setTimeout: mocks.delay
} ) );

import { drainStream } from './stream.js';

/** Hands the test the trigger for the drain's deadline, so no real timer is involved */
const controllableDeadline = () => {
  const state = { fire: null, timeouts: [] };
  mocks.delay.mockImplementation( ( timeoutMs, value ) => new Promise( resolve => {
    state.timeouts.push( timeoutMs );
    state.fire = () => resolve( value );
  } ) );
  return state;
};

/** Lets the drain run until it parks on its next read */
const flush = () => new Promise( resolve => setImmediate( resolve ) );

const asyncParts = parts => ( {
  async *[Symbol.asyncIterator]() {
    yield* parts;
  }
} );

const streamOf = parts => ( { stream: asyncParts( parts ) } );

/** Records what the drain pulled, so a test can tell where it stopped reading */
const recordingStreamOf = parts => {
  const read = [];
  return {
    read,
    stream: {
      async *[Symbol.asyncIterator]() {
        for ( const part of parts ) {
          read.push( part.type );
          yield part;
        }
      }
    }
  };
};

/** Yields its parts and then hangs, the way a provider that never closes its connection does */
const stallingStreamOf = ( parts, released ) => ( {
  stream: {
    async *[Symbol.asyncIterator]() {
      yield* parts;
      await released;
    }
  }
} );

/** Hangs after its parts and records whether the drain released the iterator on the way out */
const releasableStreamOf = parts => {
  const state = { index: 0, returned: false };
  return {
    state,
    stream: {
      [Symbol.asyncIterator]: () => ( {
        next: async () => ( state.index < parts.length ?
          { done: false, value: parts[state.index++] } :
          new Promise( () => {} ) ),
        return: async () => {
          state.returned = true;
          return { done: true };
        }
      } )
    }
  };
};

describe( 'drainStream', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    // a deadline that never fires, so only the tests about giving up deal with it
    mocks.delay.mockImplementation( () => new Promise( () => {} ) );
  } );

  it( 'consumes stream parts without throwing', async () => {
    await expect( drainStream( streamOf( [ { type: 'text-delta', text: 'hi' } ] ) ) ).resolves.toBeUndefined();
  } );

  it( 'throws the abort signal reason when it is an Error', async () => {
    const abortController = new AbortController();
    const abortReason = new Error( 'Cancelled by caller' );
    abortController.abort( abortReason );

    await expect( drainStream(
      streamOf( [ { type: 'abort', reason: abortReason.message } ] ),
      abortController.signal
    ) ).rejects.toBe( abortReason );
  } );

  it( 'throws part.reason when the abort signal reason is not an Error', async () => {
    const abortController = new AbortController();
    abortController.abort( 'cancelled' );

    await expect( drainStream(
      streamOf( [ { type: 'abort', reason: 'from-part' } ] ),
      abortController.signal
    ) ).rejects.toMatchObject( { message: 'from-part', cause: 'cancelled' } );
  } );

  it( 'throws a generic abort error when no reason is available', async () => {
    await expect( drainStream( streamOf( [ { type: 'abort' } ] ) ) ).rejects.toThrow( 'Streaming generation aborted.' );
  } );

  it( 'throws the provider error when the error part is an Error', async () => {
    const error = new Error( 'Provider failed' );

    await expect( drainStream( streamOf( [ { type: 'error', error } ] ) ) ).rejects.toBe( error );
  } );

  it( 'wraps a non-Error error part', async () => {
    await expect( drainStream( streamOf( [ { type: 'error', error: 'no model' } ] ) ) ).rejects.toThrow( 'no model' );
  } );

  it( 'throws a generic stream error when the error part has no value', async () => {
    await expect( drainStream( streamOf( [ { type: 'error', error: null } ] ) ) ).rejects.toThrow( 'Streaming generation failed.' );
  } );

  it( 'keeps reading after a failure so the sdk can report the steps that preceded it', async () => {
    const error = new Error( 'Provider failed' );
    const stream = recordingStreamOf( [
      { type: 'text-delta', text: 'hi' },
      { type: 'error', error },
      { type: 'finish-step' },
      { type: 'finish' }
    ] );

    await expect( drainStream( stream ) ).rejects.toBe( error );
    expect( stream.read ).toEqual( [ 'text-delta', 'error', 'finish-step', 'finish' ] );
  } );

  it( 'throws the first failure when the stream reports more than one', async () => {
    const first = new Error( 'first failure' );

    await expect( drainStream( streamOf( [
      { type: 'error', error: first },
      { type: 'error', error: new Error( 'second failure' ) }
    ] ) ) ).rejects.toBe( first );
  } );

  it( 'gives up on a stream that stalls after a failure and throws what it captured', async () => {
    const deadline = controllableDeadline();
    const error = new Error( 'Provider failed' );
    const neverReleased = new Promise( () => {} );
    const drained = drainStream( stallingStreamOf( [ { type: 'error', error } ], neverReleased ) );

    await flush();
    deadline.fire();

    await expect( drained ).rejects.toBe( error );
    expect( deadline.timeouts ).toEqual( [ 250 ] );
  } );

  it( 'gives up on a stream that stalls after the caller aborted', async () => {
    const deadline = controllableDeadline();
    const abortController = new AbortController();
    abortController.abort( new Error( 'Cancelled by caller' ) );
    const stalling = releasableStreamOf( [ { type: 'text-delta', text: 'hi' } ] );
    const drained = drainStream( stalling, abortController.signal );

    await flush();
    deadline.fire();

    await expect( drained ).resolves.toBeUndefined();
    expect( stalling.state.returned ).toBe( true );
  } );

  it( 'keeps draining an aborted stream while it still delivers parts', async () => {
    const abortController = new AbortController();
    const abortReason = new Error( 'Cancelled by caller' );
    abortController.abort( abortReason );
    const stream = recordingStreamOf( [
      { type: 'abort', reason: 'Cancelled by caller' },
      { type: 'finish-step' },
      { type: 'finish' }
    ] );

    await expect( drainStream( stream, abortController.signal ) ).rejects.toBe( abortReason );
    expect( stream.read ).toEqual( [ 'abort', 'finish-step', 'finish' ] );
  } );

  it( 'never arms a deadline while the stream is healthy', async () => {
    const released = { resolve: null };
    const pending = new Promise( resolve => {
      released.resolve = resolve;
    } );
    const drained = drainStream( stallingStreamOf( [ { type: 'text-delta', text: 'hi' } ], pending ) );

    await flush();
    released.resolve();

    await expect( drained ).resolves.toBeUndefined();
    expect( mocks.delay ).not.toHaveBeenCalled();
  } );
} );
