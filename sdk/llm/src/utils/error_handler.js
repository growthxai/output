import { APICallError } from 'ai';
import { FatalError } from '@outputai/core';

export const mapAiError = error => {
  if ( error instanceof FatalError ) {
    return error;
  }
  if ( APICallError.isInstance( error ) && !error.isRetryable ) {
    const { statusCode, message } = error;
    const msg = `AI-SDK permanent error${statusCode ? ` with HTTP ${statusCode}` : ''}: ${message}`;
    return new FatalError( msg, { cause: error } );
  }
  return error;
};
