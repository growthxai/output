import {
  APICallError,
  InvalidArgumentError,
  InvalidDataContentError,
  InvalidPromptError,
  LoadAPIKeyError,
  LoadSettingError,
  NoImageGeneratedError,
  NoSuchModelError,
  NoSuchProviderError,
  UnsupportedFunctionalityError
} from 'ai';
import { FatalError } from '@outputai/core';

const toFatalError = ( error, extraMessage = '' ) => new FatalError(
  `AI-SDK fatal error${extraMessage ? ` (${extraMessage})` : ''}: ${error.message}`,
  { cause: error }
);

export const mapAiError = error => {
  if ( error instanceof FatalError ) {
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
