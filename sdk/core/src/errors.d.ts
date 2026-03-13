/**
 * Error indicating a non-recoverable failure.
 *
 * Throw this error to end the workflow execution altogether without retries.
 */
export class FatalError extends Error { }

/**
 * Error indicating invalid input or schema validation issues.
 *
 * This error is thrown when there are validation errors, either in the input or output, for steps, evaluators, and workflows.
 *
 * It will end the workflow execution without retries.
 */
export class ValidationError extends Error { }
