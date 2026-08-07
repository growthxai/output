/**
 * These are errors exposed as tools for the user to break their flow
 * They work in both steps and workflows
 */

/**
 * A FatalError breaks workflow execution
 */
export class FatalError extends Error {
  name = 'FatalError';
}

/**
 * It is a specialization of the FatalError to indicate validation problems
 */
export class ValidationError extends FatalError {
  name = 'ValidationError';
}

/**
 * It serves to indicate a FatalError, but has no properties of its own, except cause.
 *
 * The SDK will discard it and use its cause in its place for logs, traces and the thrown error.
 */
export class TransparentFatalError extends FatalError {
  constructor( cause ) {
    if ( !( cause instanceof Error ) ) {
      throw new FatalError( 'TransparentFatalError argument must be an Error instance' );
    }
    super( undefined, { cause } );
  }
}
