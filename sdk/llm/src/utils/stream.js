import { setTimeout as delay } from 'node:timers/promises';

/** Time a failed stream gets to deliver its remaining parts before the drain gives up on it */
const FAILURE_DRAIN_TIMEOUT_MS = 250;

const TIMED_OUT = Symbol( 'drain-timed-out' );

/** Extracts the error an abort or error part should surface, or null for every other part */
const extractError = ( part, abortSignal ) => {
  if ( part?.type === 'abort' ) {
    const reason = abortSignal?.reason;
    return reason instanceof Error ?
      reason :
      new Error( part.reason ?? 'Streaming aborted.', { cause: reason } );
  }

  if ( part?.type === 'error' ) {
    return part.error instanceof Error ?
      part.error :
      new Error( part.error ? String( part.error ) : 'Streaming failed.', { cause: part.error } );
  }

  if ( abortSignal?.aborted ) {
    return abortSignal.reason instanceof Error ?
      abortSignal.reason :
      new Error( 'Streaming aborted.', { cause: abortSignal.reason } );
  }

  return null;
};

/** Reads the next part, resolving with `TIMED_OUT` when the stream goes quiet for longer than `timeoutMs` */
const nextWithin = async ( iterator, timeoutMs ) =>
  Promise.race( [ iterator.next(), delay( timeoutMs, TIMED_OUT, { ref: false } ) ] );

/**
 * Consumes a streaming result until it completes, then throws the first abort or error part it saw.
 * Callers must not throw from the AI SDK `onError` callback; that errors the stream before these parts are delivered.
 *
 * The draining continues past a failure on purpose: the AI SDK fires its lifecycle callbacks as parts flow through the
 * stream, so `onStepEnd` and `onEnd` - and with them the usage of everything already spent - only arrive if something
 * keeps reading. A stalled provider can leave the stream open forever, so once a failure is captured the remaining
 * parts get `FAILURE_DRAIN_TIMEOUT_MS` to arrive before the drain gives up and throws anyway. A healthy stream ends
 * immediately after a failure, so the timeout is not part of the normal path; a successful stream is never timed out.
 *
 * @param {object} stream - AI SDK stream result with `stream`
 * @param {AbortSignal} [abortSignal] - Used to recover the original abort reason
 */
export const drainStream = async ( stream, abortSignal ) => {
  const iterator = stream.stream[Symbol.asyncIterator]();
  const state = { error: null };

  while ( true ) {
    const hasDeadline = state.error || abortSignal?.aborted;
    const result = await ( hasDeadline ? nextWithin( iterator, FAILURE_DRAIN_TIMEOUT_MS ) : iterator.next() );

    if ( result.done ) {
      break;
    }

    if ( result?.value || abortSignal?.aborted ) {
      state.error ??= extractError( result.value, abortSignal );
    }

    if ( result === TIMED_OUT ) {
      iterator.return?.()?.catch( () => {} );
      break;
    }
  }

  if ( state.error ) {
    throw state.error;
  }
};
