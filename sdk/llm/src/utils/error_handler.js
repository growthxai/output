import * as ai from 'ai';
import { FatalError, TransparentFatalError } from '@outputai/core';

const nonRetryableAiSdkErrorTypes = [
  ai.InvalidArgumentError, // Invalid call settings are deterministic caller bugs, so retrying the same activity cannot fix them.
  ai.InvalidDataContentError, // Invalid media content has the wrong local shape/encoding and will fail again with the same input.
  ai.InvalidPromptError, // Invalid prompt structure is a deterministic request-construction error.
  ai.LoadAPIKeyError, // Missing or invalid API key configuration will not change during an activity retry.
  ai.LoadSettingError, // Missing or invalid provider settings are deployment/configuration problems.
  ai.NoImageGeneratedError, // Image generation completed provider calls but collected zero images; repeating identical input is not useful.
  ai.NoSuchProviderError, // A missing provider id is a deterministic provider registry/configuration error.
  ai.NoSuchModelError, // A missing model id is a deterministic provider/model configuration error.
  ai.UnsupportedFunctionalityError // The selected model/output mode does not support the requested feature.
];

/**
 * Maps an AI SDK error to a framework error:
 * - AI SDK Unrecoverable error types become TransparentFatalErrors;
 * - AI SDK API error with isRetryable=false become TransparentFatalErrors;
 * Some errors are not mapped:
 * - Grammar which technically are isRetryable=false, will be rethrown, because they are actually transient;
 * - Other errors are rethrown as well;
 *
 * @param {object} error - Original Error
 * @returns {object} A new Error
 */
export const mapAiError = error => {
  if ( error instanceof FatalError ) {
    return error;
  }

  const isApiError = ai.APICallError.isInstance( error );
  const isGrammarCompilationError = error.message === 'Grammar compilation timed out.';

  // This error is actually transient, so instead of FatalError, return it
  if ( isApiError && error.statusCode === 400 && isGrammarCompilationError ) {
    return error;
  }

  // Non-retryable API failures are already classified by AI SDK as permanent provider failures.
  if ( isApiError && !error.isRetryable ) {
    return new TransparentFatalError( error );
  }

  if ( nonRetryableAiSdkErrorTypes.some( E => E.isInstance( error ) ) ) {
    return new TransparentFatalError( error );
  }
  return error;
};
