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

  it.each( [
    [ 'string', 'boom', 'boom' ],
    [ 'number', 42, '42' ],
    [ 'boolean', true, 'true' ],
    [ 'bigint', 1n, '1' ],
    [ 'symbol', Symbol( 'x' ), 'Symbol(x)' ],
    [ 'named function', function named() {}, 'function named() {}' ],
    [ 'arrow function', () => {}, '() => {}' ]
  ] )( 'stringifies a %s into Error.message', ( _label, input, message ) => {
    const result = rehydrateError( input );

    expect( result ).toBeInstanceOf( Error );
    expect( result.message ).toBe( message );
    expect( result.stack ).toBeUndefined();
  } );

  it( 'copies enumerable array indexes onto an empty Error', () => {
    const result = rehydrateError( [ 'a', 'b' ] );

    expect( result ).toBeInstanceOf( Error );
    expect( result.message ).toBe( '' );
    expect( result.stack ).toBeUndefined();
    expect( result[0] ).toBe( 'a' );
    expect( result[1] ).toBe( 'b' );
  } );

  it( 'returns an empty Error for RegExp and Date (no enumerable own props)', () => {
    const fromRegexp = rehydrateError( /foo/gi );
    const fromDate = rehydrateError( new Date( '2020-01-01T00:00:00.000Z' ) );

    expect( fromRegexp ).toBeInstanceOf( Error );
    expect( fromRegexp.message ).toBe( '' );
    expect( fromRegexp.stack ).toBeUndefined();

    expect( fromDate ).toBeInstanceOf( Error );
    expect( fromDate.message ).toBe( '' );
    expect( fromDate.stack ).toBeUndefined();
  } );

  it( 'copies enumerable own props from a custom class instance', () => {
    class Widget {
      constructor() {
        this.x = 1;
        this.name = 'WidgetError';
      }
    }

    const result = rehydrateError( new Widget() );

    expect( result ).toBeInstanceOf( Error );
    expect( result.message ).toBe( '' );
    expect( result.stack ).toBeUndefined();
    expect( result.x ).toBe( 1 );
    expect( result.name ).toBe( 'WidgetError' );
  } );
} );
