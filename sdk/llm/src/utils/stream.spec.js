import { afterEach, describe, expect, it, vi } from 'vitest';
import { drainStream } from './stream.js';

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

describe( 'drainStream', () => {
  afterEach( () => {
    vi.useRealTimers();
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
    vi.useFakeTimers();
    const error = new Error( 'Provider failed' );
    const neverReleased = new Promise( () => {} );
    const drained = drainStream( stallingStreamOf( [ { type: 'error', error } ], neverReleased ) );
    const assertion = expect( drained ).rejects.toBe( error );

    await vi.advanceTimersByTimeAsync( 250 );

    await assertion;
  } );

  it( 'does not time out a stream that is still delivering parts', async () => {
    vi.useFakeTimers();
    const released = { resolve: null };
    const pending = new Promise( resolve => {
      released.resolve = resolve;
    } );
    const drained = drainStream( stallingStreamOf( [ { type: 'text-delta', text: 'hi' } ], pending ) );

    await vi.advanceTimersByTimeAsync( 10_000 );
    released.resolve();

    await expect( drained ).resolves.toBeUndefined();
  } );
} );
