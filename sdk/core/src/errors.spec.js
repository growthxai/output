import { describe, it, expect } from 'vitest';
import { FatalError, ValidationError } from './errors.js';

// Regression: the instance `.name` must equal the class name. Temporal's
// default activity failure converter types the ApplicationFailure from the
// thrown error's `.name`, and that type is matched against
// `nonRetryableErrorTypes`. If `.name` falls back to the inherited "Error",
// a FatalError/ValidationError thrown from a step is retried instead of
// failing fast.
describe( 'errors', () => {
  describe( 'FatalError', () => {
    it( 'sets name to the class name so it matches nonRetryableErrorTypes', () => {
      expect( new FatalError( 'boom' ).name ).toBe( 'FatalError' );
    } );

    it( 'preserves the message and is an Error', () => {
      const error = new FatalError( 'boom' );
      expect( error ).toBeInstanceOf( Error );
      expect( error.message ).toBe( 'boom' );
    } );
  } );

  describe( 'ValidationError', () => {
    it( 'sets name to the class name so it matches nonRetryableErrorTypes', () => {
      expect( new ValidationError( 'bad input' ).name ).toBe( 'ValidationError' );
    } );

    it( 'preserves the message and is an Error', () => {
      const error = new ValidationError( 'bad input' );
      expect( error ).toBeInstanceOf( Error );
      expect( error.message ).toBe( 'bad input' );
    } );
  } );
} );
