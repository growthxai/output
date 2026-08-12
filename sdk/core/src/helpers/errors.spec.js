import { describe, expect, it } from 'vitest';
import { inheritsFromAnyNamedType, rehydrateError } from './errors.js';

describe( 'inheritsFromAnyNamedType', () => {
  class BaseFailure extends Error {}
  class DomainFailure extends BaseFailure {}
  class RequestFailure extends DomainFailure {}
  class UnrelatedFailure extends Error {}

  it( 'matches exact, parent, and grandparent constructor names', () => {
    const error = new RequestFailure( 'request failed' );

    expect( inheritsFromAnyNamedType( error, [ 'RequestFailure' ] ) ).toBe( true );
    expect( inheritsFromAnyNamedType( error, [ 'DomainFailure' ] ) ).toBe( true );
    expect( inheritsFromAnyNamedType( error, [ 'BaseFailure' ] ) ).toBe( true );
    expect( inheritsFromAnyNamedType( error, [ 'OtherFailure', 'BaseFailure' ] ) ).toBe( true );
  } );

  it( 'does not match unrelated or descendant constructor names', () => {
    expect( inheritsFromAnyNamedType( new RequestFailure(), [ 'UnrelatedFailure' ] ) ).toBe( false );
    expect( inheritsFromAnyNamedType( new BaseFailure(), [ 'RequestFailure' ] ) ).toBe( false );
    expect( inheritsFromAnyNamedType( new UnrelatedFailure(), [ 'BaseFailure' ] ) ).toBe( false );
  } );

  it( 'ignores a spoofed own constructor property', () => {
    const error = new RequestFailure();
    Object.defineProperty( error, 'constructor', {
      value: { name: 'SpoofedFailure' }
    } );

    expect( inheritsFromAnyNamedType( error, [ 'SpoofedFailure' ] ) ).toBe( false );
    expect( inheritsFromAnyNamedType( error, [ 'RequestFailure' ] ) ).toBe( true );
  } );

  it( 'rejects empty names and invalid values without false positives', () => {
    const unnamedConstructor = function NamedConstructor() {};
    Object.defineProperty( unnamedConstructor, 'name', { value: '' } );
    const value = Object.create( { constructor: unnamedConstructor } );

    expect( inheritsFromAnyNamedType( value, [ '', undefined ] ) ).toBe( false );
    expect( inheritsFromAnyNamedType( value, [] ) ).toBe( false );
    expect( inheritsFromAnyNamedType( null, [ 'BaseFailure' ] ) ).toBe( false );
    expect( inheritsFromAnyNamedType( 'failure', [ 'String' ] ) ).toBe( false );
  } );
} );

describe( 'rehydrateError', () => {
  it( 'returns the same Error instance when given an Error', () => {
    const original = new Error( 'already an error' );
    original.name = 'FatalError';

    expect( rehydrateError( original ) ).toBe( original );
  } );

  it( 'rebuilds a plain serialized error with name and message', () => {
    const result = rehydrateError( {
      name: 'FatalError',
      message: 'workflow failed'
    } );

    expect( result ).toBeInstanceOf( Error );
    expect( result.name ).toBe( 'FatalError' );
    expect( result.message ).toBe( 'workflow failed' );
    expect( result.stack ).toBeUndefined();
  } );

  it( 'restores stack when present on the serialized object', () => {
    const result = rehydrateError( {
      name: 'Error',
      message: 'boom',
      stack: 'Error: boom\n    at workflow.js:1:1'
    } );

    expect( result.stack ).toBe( 'Error: boom\n    at workflow.js:1:1' );
  } );

  it( 'copies additional enumerable properties', () => {
    const result = rehydrateError( {
      name: 'HTTPError',
      message: 'bad request',
      status: 400,
      code: 'BAD_REQUEST'
    } );

    expect( result.status ).toBe( 400 );
    expect( result.code ).toBe( 'BAD_REQUEST' );
  } );

  it( 'recursively rehydrates a plain-object cause', () => {
    const result = rehydrateError( {
      name: 'ActivityFailure',
      message: 'Activity task failed',
      cause: {
        name: 'ApplicationFailure',
        message: 'root failure',
        cause: {
          name: 'ValidationError',
          message: 'invalid input'
        }
      }
    } );

    expect( result.cause ).toBeInstanceOf( Error );
    expect( result.cause.name ).toBe( 'ApplicationFailure' );
    expect( result.cause.message ).toBe( 'root failure' );
    expect( result.cause.cause ).toBeInstanceOf( Error );
    expect( result.cause.cause.name ).toBe( 'ValidationError' );
    expect( result.cause.cause.message ).toBe( 'invalid input' );
  } );

  it( 'leaves a non-object cause unchanged', () => {
    const result = rehydrateError( {
      name: 'Error',
      message: 'outer',
      cause: 'string cause'
    } );

    expect( result.cause ).toBe( 'string cause' );
  } );

  it( 'returns an empty Error for null and undefined without throwing', () => {
    const fromNull = rehydrateError( null );
    const fromUndefined = rehydrateError( undefined );

    expect( fromNull ).toBeInstanceOf( Error );
    expect( fromNull.message ).toBe( '' );
    expect( fromNull.stack ).toBeUndefined();

    expect( fromUndefined ).toBeInstanceOf( Error );
    expect( fromUndefined.message ).toBe( '' );
    expect( fromUndefined.stack ).toBeUndefined();
  } );
} );
