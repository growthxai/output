import { step } from '@outputai/core';
import { streamText } from '@outputai/llm';
import { workflowOutputSchema } from './types.js';

const isMaskedError = ( error: Error ): boolean => {
  const parts = [ error.name, error.message ];
  if ( error.cause instanceof Error ) {
    parts.push( error.cause.name, error.cause.message );
  }
  return parts.join( ' ' ).includes( 'NoOutputGenerated' );
};

const describeError = ( error: unknown ) => {
  const err = error instanceof Error ? error : new Error( String( error ) );
  const cause = err.cause instanceof Error ? err.cause : undefined;
  return {
    failed: true,
    errorName: cause?.name || err.name,
    errorMessage: cause?.message || err.message,
    isMasked: isMaskedError( err )
  };
};

/**
 * The provider error is delivered to onError, not thrown by textStream. Stash it,
 * iterate the stream, then throw the stashed error so the step sees the root cause
 * instead of an empty success or AI_NoOutputGeneratedError.
 */
export const streamMissingModel = step( {
  name: 'streamMissingModel',
  description: 'streamText onError should surface the provider error',
  outputSchema: workflowOutputSchema,
  fn: async () => {
    const captured: { error: unknown } = { error: null };

    try {
      const result = streamText( {
        prompt: 'missing_model@v1',
        onError( { error } ) {
          captured.error = error;
        }
      } );

      for await ( const chunk of result.textStream ) {
        void chunk;
      }

      if ( captured.error ) {
        throw captured.error;
      }

      return {
        failed: false,
        errorName: '',
        errorMessage: '',
        isMasked: false
      };
    } catch ( error ) {
      return describeError( captured.error ?? error );
    }
  }
} );
