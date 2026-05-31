/**
 * These are errors exposed as tools for the user to break their flow
 * They work in both steps and workflows
 */

/**
 * Any generic fatal errors
 */
export class FatalError extends Error {
  // Set the instance `.name` to the class name. Temporal's default failure
  // converter types an activity's ApplicationFailure from the thrown error's
  // `.name`, and that type is what `nonRetryableErrorTypes` matches against.
  // Without this, `name` inherits "Error", so a FatalError thrown from a STEP
  // never matches `nonRetryableErrorTypes: ["FatalError"]` and gets retried.
  constructor( ...args ) {
    super( ...args );
    this.name = 'FatalError';
  }
}

/**
 * Any validation error
 */
export class ValidationError extends Error {
  // See FatalError above — the instance `.name` must equal the class name so
  // the activity failure converter tags it as non-retryable.
  constructor( ...args ) {
    super( ...args );
    this.name = 'ValidationError';
  }
}
