import { describe, expect, it } from 'vitest';
import { drainStream } from './stream.js';

const asyncParts = parts => ( {
  async *[Symbol.asyncIterator]() {
    yield* parts;
  }
} );

const streamOf = parts => ( { fullStream: asyncParts( parts ) } );

describe( 'drainStream', () => {
  it( 'consumes fullStream parts without throwing', async () => {
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
} );
