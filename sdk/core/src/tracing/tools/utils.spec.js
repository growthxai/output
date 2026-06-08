import { describe, expect, it } from 'vitest';
import { serializeError } from './utils.js';

describe( 'serializeError', () => {
  it( 'serializes basic Error fields', () => {
    const error = new Error( 'boom' );

    const result = serializeError( error );

    expect( result ).toMatchObject( {
      name: 'Error',
      message: 'boom'
    } );
    expect( typeof result.stack ).toBe( 'string' );
    expect( result ).not.toHaveProperty( 'cause' );
  } );

  it( 'preserves custom error constructor names', () => {
    class CustomError extends Error {}
    const error = new CustomError( 'custom boom' );

    expect( serializeError( error ) ).toMatchObject( {
      name: 'CustomError',
      message: 'custom boom'
    } );
  } );

  it( 'recursively serializes Error causes', () => {
    const root = new TypeError( 'root failure' );
    const wrapped = new Error( 'wrapped failure', { cause: root } );

    expect( serializeError( wrapped ) ).toMatchObject( {
      name: 'Error',
      message: 'wrapped failure',
      cause: {
        name: 'TypeError',
        message: 'root failure'
      }
    } );
  } );

  it( 'preserves JSON-serializable non-Error causes', () => {
    const cause = {
      code: 'bad_input',
      path: [ 'items', 0, 'title' ],
      message: 'Expected title'
    };
    const error = new Error( 'validation failed', { cause } );

    expect( serializeError( error ) ).toMatchObject( {
      name: 'Error',
      message: 'validation failed',
      cause
    } );
  } );

  it( 'falls back to inspect for non-JSON-serializable causes', () => {
    const cause = { name: 'circular' };
    cause.self = cause;
    const error = new Error( 'failed', { cause } );

    const result = serializeError( error );

    expect( result.cause ).toContain( 'circular' );
    expect( result.cause ).toContain( 'Circular' );
  } );

  it( 'falls back to inspect for primitive values JSON cannot serialize', () => {
    expect( serializeError( 1n ) ).toBe( '1n' );
  } );

  it( 'stops serializing cause chains after the depth limit', () => {
    const makeErrorChain = depth => depth === 0 ?
      new Error( 'leaf' ) :
      new Error( `level ${depth}`, { cause: makeErrorChain( depth - 1 ) } );
    const getCauseAtDepth = ( error, depth ) => depth === 0 ?
      error :
      getCauseAtDepth( error.cause, depth - 1 );

    expect( getCauseAtDepth( serializeError( makeErrorChain( 11 ) ), 11 ) )
      .toEqual( { name: 'Error', message: 'Cause chain too deep' } );
  } );
} );
