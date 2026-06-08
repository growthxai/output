import {
  APICallError,
  InvalidArgumentError,
  InvalidDataContentError,
  InvalidPromptError,
  LoadAPIKeyError,
  LoadSettingError,
  NoImageGeneratedError,
  NoObjectGeneratedError,
  NoSuchModelError,
  NoSuchProviderError,
  UnsupportedFunctionalityError
} from 'ai';
import { FatalError } from '@outputai/core';

// AI SDK does not expose a dedicated schema-mismatch discriminator for NoObjectGeneratedError.
const NO_OBJECT_SCHEMA_MISMATCH_MESSAGE = 'No object generated: response did not match schema.';

/**
 * Recursively search an error cause chain until finds an error which is instance of given prototype.
 *
 * @param {object} error - Error instance.
 * @param {Function|string} _class - Target constructor or constructor name.
 * @param {number} depth - Current depth, search up to 10 causes deep.
 * @returns {object|null} - Error or null if not found.
 */
export const findInstanceInCauseChain = ( error, _class, depth = 0 ) => {
  if ( !error || typeof error !== 'object' ) {
    return null;
  }
  if ( typeof _class === 'string' && error.constructor?.name === _class ) {
    return error;
  }
  if ( typeof _class === 'function' && error instanceof _class ) {
    return error;
  }
  if ( depth >= 10 ) {
    return null;
  }
  return error.cause ? findInstanceInCauseChain( error.cause, _class, depth + 1 ) : null;
};

const toFatalError = ( error, extraMessage = '' ) => new FatalError(
  `AI-SDK fatal error${extraMessage ? ` (${extraMessage})` : ''}: ${error.message}`,
  { cause: error }
);

/**
 * Map an AI SDK error to a framework specific error:
 *
 * Unrecoverable errors become FatalErrors.
 *
 * NoObjectGeneratedError from invalid schema are reinitialized with a better message.
 *
 * @param {object} error - Original Error
 * @returns {object} A new Error
 */
export const mapAiError = error => {
  if ( error instanceof FatalError ) {
    return error;
  }

  // NoObjectGeneratedError can be thrown when the response doesn't match the schema.
  // This re-creates the error with a better message, making it easier to debug.
  if ( NoObjectGeneratedError.isInstance( error ) && error.message.includes( NO_OBJECT_SCHEMA_MISMATCH_MESSAGE ) ) {
    const zodError = findInstanceInCauseChain( error, 'ZodError' );
    if ( zodError && zodError.issues?.length > 0 ) {
      const [ { path, message } ] = zodError.issues;
      return new NoObjectGeneratedError( {
        message: `${error.message} First issue is "${message}" at path [${path.join( ', ' )}].`,
        cause: error.cause,
        text: error.text,
        response: error.response,
        usage: error.usage,
        finishReason: error.finishReason
      } );
    }
    return error;
  }

  if ( APICallError.isInstance( error ) && !error.isRetryable ) {
    // Non-retryable API failures are already classified by AI SDK as permanent provider failures.
    return toFatalError( error, error.statusCode ? `HTTP ${error.statusCode}` : '' );
  }
  if ( InvalidArgumentError.isInstance( error ) ) {
    // Invalid call settings are deterministic caller bugs, so retrying the same activity cannot fix them.
    return toFatalError( error );
  }
  if ( InvalidDataContentError.isInstance( error ) ) {
    // Invalid media content has the wrong local shape/encoding and will fail again with the same input.
    return toFatalError( error );
  }
  if ( InvalidPromptError.isInstance( error ) ) {
    // Invalid prompt structure is a deterministic request-construction error.
    return toFatalError( error );
  }
  if ( LoadAPIKeyError.isInstance( error ) ) {
    // Missing or invalid API key configuration will not change during an activity retry.
    return toFatalError( error );
  }
  if ( LoadSettingError.isInstance( error ) ) {
    // Missing or invalid provider settings are deployment/configuration problems.
    return toFatalError( error );
  }
  if ( NoImageGeneratedError.isInstance( error ) ) {
    // Image generation completed provider calls but collected zero images; repeating identical input is not useful.
    return toFatalError( error );
  }
  if ( NoSuchProviderError.isInstance( error ) ) {
    // A missing provider id is a deterministic provider registry/configuration error.
    return toFatalError( error );
  }
  if ( NoSuchModelError.isInstance( error ) ) {
    // A missing model id is a deterministic provider/model configuration error.
    return toFatalError( error );
  }
  if ( UnsupportedFunctionalityError.isInstance( error ) ) {
    // The selected model/output mode does not support the requested feature.
    return toFatalError( error );
  }
  return error;
};
