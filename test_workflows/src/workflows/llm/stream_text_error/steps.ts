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
 * Consumes textStream the same way typical steps do. The prompt names a model
 * that does not exist so the provider fails before any tokens. That failure
 * must throw here as the real provider error, not AI_NoOutputGeneratedError.
 */
export const streamMissingModel = step( {
  name: 'streamMissingModel',
  description: 'streamText + textStream should surface the provider error',
  outputSchema: workflowOutputSchema,
  fn: async () => {
    try {
      const result = streamText( { prompt: 'missing_model@v1' } );

      for await ( const chunk of result.textStream ) {
        void chunk;
      }

      return {
        failed: false,
        errorName: '',
        errorMessage: '',
        isMasked: false
      };
    } catch ( error ) {
      return describeError( error );
    }
  }
} );
