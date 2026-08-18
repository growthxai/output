/**
 * Consumes a streaming result until it completes. Throws on abort or error parts.
 * Callers must not throw from the AI SDK `onError` callback; that errors the stream before these parts are delivered.
 *
 * @param {object} stream - AI SDK stream result with `fullStream`
 * @param {AbortSignal} [abortSignal] - Used to recover the original abort reason
 */
export const drainStream = async ( stream, abortSignal ) => {
  for await ( const part of stream.fullStream ) {
    if ( part.type === 'abort' ) {
      const reason = abortSignal?.reason;
      throw reason instanceof Error ?
        reason :
        new Error( part.reason ?? 'Streaming generation aborted.', { cause: reason } );
    }
    if ( part.type === 'error' ) {
      throw part.error instanceof Error ?
        part.error :
        new Error( part.error ? String( part.error ) : 'Streaming generation failed.', { cause: part.error } );
    }
  }
};
