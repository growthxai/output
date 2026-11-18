import { describe, expect, it } from 'vitest';
import { FatalError, TransparentFatalError, ValidationError } from './errors.js';

describe( 'SDK errors', () => {
  it( 'treats validation and transparent errors as fatal errors', () => {
    const cause = new TypeError( 'provider rejected request' );
    const transparentError = new TransparentFatalError( cause );

    expect( new ValidationError( 'invalid input' ) ).toBeInstanceOf( FatalError );
    expect( transparentError ).toBeInstanceOf( FatalError );
    expect( transparentError.cause ).toBe( cause );
  } );

  it( 'rejects transparent errors without an Error cause', () => {
    expect( () => new TransparentFatalError( 'provider rejected request' ) ).toThrow(
      new FatalError( 'TransparentFatalError argument must be an Error instance' )
    );
  } );
} );
