/**
 * Error indicating a non-recoverable failure.
 *
 * Throw this error to end the workflow execution altogether without retries.
 */
export class FatalError extends Error {}

/**
 * Error indicating invalid input or schema validation issues.
 *
 * This error is thrown when there are validation errors, either in the input or output, for steps, evaluators, and workflows.
 *
 * It will end the workflow execution without retries.
 */
export class ValidationError extends FatalError {}

/**
 * It serves to indicate a FatalError, but has no properties of its own, except cause.
 *
 * The SDK will discard it and use its cause in its place for logs, traces and the thrown error.
 */
export class TransparentFatalError extends FatalError {
  readonly cause: Error;
  constructor( cause: Error );
}
