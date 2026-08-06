import { describe, expect, it, vi } from 'vitest';
import {
  flattenPrototypeChain,
  resolveErrorName,
  serializeError,
  truncateArray,
  truncateString
} from './error_serializer.js';

const redactUrlMock = vi.hoisted( () => vi.fn().mockReturnValue( '[Redacted URL]' ) );
const isUrlMock = vi.hoisted( () => vi.fn().mockReturnValue( false ) );

vi.mock( './redact.js', () => ( { redactUrl: redactUrlMock } ) );
vi.mock( './string.js', () => ( { isUrl: isUrlMock } ) );

describe( 'error serializer helpers', () => {
  describe( 'truncateString', () => {
    it( 'preserves values within the limit and marks omitted characters', () => {
      expect( truncateString( 'exact', 5 ) ).toBe( 'exact' );
      expect( truncateString( 'longer', 5 ) ).toBe( 'longe... [1 more characters omitted]' );
    } );
  } );

  describe( 'truncateArray', () => {
    it( 'preserves values within the limit and marks omitted items without mutating the source', () => {
      const exact = [ 1, 2 ];
      const long = [ 1, 2, 3 ];

      expect( truncateArray( exact, 2 ) ).toBe( exact );
      expect( truncateArray( long, 2 ) ).toEqual( [ 1, 2, '... [1 more items omitted]' ] );
      expect( long ).toEqual( [ 1, 2, 3 ] );
    } );
  } );

  describe( 'flattenPrototypeChain', () => {
    it( 'returns child-first prototypes and honors the depth limit', () => {
      const grandparent = { grandparent: true };
      const parent = Object.create( grandparent );
      const child = Object.create( parent );

      expect( flattenPrototypeChain( child, 0, [], 2 ) ).toEqual( [ child, parent ] );
      expect( flattenPrototypeChain( child, 0, [], 3 ) ).toEqual( [ child, parent, grandparent ] );
    } );
  } );

  describe( 'resolveErrorName', () => {
    it( 'uses explicit, inherited, and constructor names in precedence order', () => {
      class ConstructorNamedError extends Error {}
      class InheritedNamedError extends Error {}
      InheritedNamedError.prototype.name = 'InheritedName';
      class ExplicitlyNamedError extends Error {
        name = 'ExplicitName';
      }
      class ExplicitlyGenericError extends Error {
        name = 'Error';
      }

      expect( resolveErrorName( new ConstructorNamedError() ) ).toBe( 'ConstructorNamedError' );
      expect( resolveErrorName( new InheritedNamedError() ) ).toBe( 'InheritedName' );
      expect( resolveErrorName( new ExplicitlyNamedError() ) ).toBe( 'ExplicitName' );
      expect( resolveErrorName( new ExplicitlyGenericError() ) ).toBe( 'Error' );
      expect( resolveErrorName( new Error() ) ).toBe( 'Error' );
      expect( resolveErrorName( { name: 'ObjectName' } ) ).toBeUndefined();
    } );

    it( 'returns undefined when an explicit name getter throws', () => {
      const error = new Error();
      Object.defineProperty( error, 'name', {
        get: () => {
          throw new Error( 'name unavailable' );
        }
      } );

      expect( resolveErrorName( error ) ).toBeUndefined();
    } );
  } );
} );

describe( 'serializeError', () => {
  it( 'serializes descriptors and skips unusable properties', () => {
    const error = new Error( 'step failed' );
    Object.defineProperties( error, {
      code: { value: 'ESTEP' },
      hidden: { value: 'available for debugging' },
      computed: { get: () => `computed from ${error.message}` },
      broken: {
        get: () => {
          throw new Error( 'getter failed' );
        }
      },
      callback: { value: () => 'not serializable' },
      skipped: { value: undefined },
      symbol: { value: Symbol( 'debug' ) },
      __proto__: { value: { unsafe: true } }
    } );
    error.nullable = null;

    const serialized = serializeError( error, { dropKeys: [ 'stack' ] } );

    expect( serialized ).toEqual( {
      name: 'Error',
      message: 'step failed',
      code: 'ESTEP',
      hidden: 'available for debugging',
      computed: 'computed from step failed',
      nullable: null,
      symbol: 'Symbol(debug)'
    } );
    expect( Object.hasOwn( serialized, '__proto__' ) ).toBe( false );
  } );

  it( 'applies custom dropped keys recursively and across prototypes', () => {
    class DebugError extends Error {}
    DebugError.prototype.internal = 'prototype value';

    const cause = new DebugError( 'cause failed' );
    cause.context = { internal: 'nested cause value', visible: 'cause context' };
    const error = new DebugError( 'request failed', { cause } );
    error.internal = 'instance value';
    error.context = { internal: 'nested root value', visible: 'root context' };

    const serialized = serializeError( error, { dropKeys: [ 'internal', 'stack' ] } );

    expect( serialized ).not.toHaveProperty( 'internal' );
    expect( serialized.context ).toEqual( { visible: 'root context' } );
    expect( serialized.cause ).not.toHaveProperty( 'internal' );
    expect( serialized.cause.context ).toEqual( { visible: 'cause context' } );
  } );

  it( 'merges prototype properties child-first without invoking overridden getters', () => {
    const overriddenGetter = vi.fn( () => 'base' );
    class BaseFailure extends Error {}
    Object.defineProperties( BaseFailure.prototype, {
      baseProperty: { value: 'base' },
      overridden: { get: overriddenGetter }
    } );
    class RequestFailure extends BaseFailure {}
    RequestFailure.prototype.requestProperty = 'request';

    const error = new RequestFailure( 'request failed' );
    Object.defineProperty( error, 'overridden', { value: 'instance' } );

    expect( serializeError( error, { dropKeys: [ 'stack' ] } ) ).toEqual( {
      name: 'RequestFailure',
      message: 'request failed',
      overridden: 'instance',
      requestProperty: 'request',
      baseProperty: 'base'
    } );
    expect( overriddenGetter ).not.toHaveBeenCalled();
  } );

  it( 'recursively serializes causes, nested objects, and arrays', () => {
    const databaseError = new Error( 'database unavailable' );
    databaseError.code = 'ECONNREFUSED';
    const serviceError = new Error( 'service failed', { cause: databaseError } );
    serviceError.context = {
      attempts: [
        { number: 1, metadata: { retryable: true } },
        { number: 2, metadata: null }
      ]
    };

    expect( serializeError( serviceError, { dropKeys: [ 'stack' ] } ) ).toEqual( {
      name: 'Error',
      message: 'service failed',
      cause: {
        name: 'Error',
        message: 'database unavailable',
        code: 'ECONNREFUSED'
      },
      context: {
        attempts: [
          { number: 1, metadata: { retryable: true } },
          { number: 2, metadata: null }
        ]
      }
    } );
  } );

  it( 'returns primitives as-is', () => {
    expect( serializeError( undefined ) ).toBeUndefined();
    expect( serializeError( null ) ).toBeNull();
    expect( serializeError( 42 ) ).toBe( 42 );
    expect( serializeError( true ) ).toBe( true );
  } );

  it( 'serializes Date values as ISO strings and marks invalid dates', () => {
    expect( serializeError( new Date( '2026-07-22T16:30:00.000Z' ) ) ).toBe( '2026-07-22T16:30:00.000Z' );
    expect( serializeError( new Date( 'foo' ) ) ).toBe( '[Invalid Date]' );
  } );

  it( 'serializes RegExp values with toString', () => {
    expect( serializeError( /request-\d+/gi ) ).toBe( '/request-\\d+/gi' );
  } );

  it( 'serializes bigint values with an n suffix', () => {
    expect( serializeError( 42n ) ).toBe( '42n' );
    expect( serializeError( -42n ) ).toBe( '-42n' );
  } );

  it( 'marks bigints that would exceed the string length budget', () => {
    const maxDigits = 16_383; // MAX_STRING_LEN - 1
    const tooLarge = 10n ** BigInt( maxDigits );

    expect( serializeError( tooLarge - 1n ) ).toBe( `${tooLarge - 1n}n` );
    expect( serializeError( tooLarge ) ).toBe( '[BigInt too large]' );
    expect( serializeError( -tooLarge ) ).toBe( '[BigInt too large]' );
    expect( serializeError( 10n ** 20_000n ) ).toBe( '[BigInt too large]' );
  } );

  it( 'serializes symbol values', () => {
    expect( serializeError( Symbol( 'request' ) ) ).toBe( 'Symbol(request)' );
  } );

  it( 'serializes functions by name', () => {
    function namedFunction() {}
    expect( serializeError( namedFunction ) ).toBe( '[Function: namedFunction]' );
    expect( serializeError( () => undefined ) ).toBe( '[Function: (anonymous)]' );
  } );

  it( 'serializes ArrayBuffers and views as type and size without dumping contents', () => {
    expect( serializeError( new Uint16Array( [ 1, 2 ] ) ) ).toBe( 'Uint16Array(2)' );
    expect( serializeError( Buffer.from( [ 1, 2 ] ) ) ).toBe( 'Buffer(2)' );
    expect( serializeError( new DataView( new ArrayBuffer( 8 ) ) ) ).toBe( 'DataView(8)' );
    expect( serializeError( new ArrayBuffer( 16 ) ) ).toBe( 'ArrayBuffer(16)' );
  } );

  it( 'redacts URL strings and URL instances with redactUrl', () => {
    const stringUrl = 'https://user:password@example.com/models?model=gpt-5&token=secret#debug';
    const url = new URL( 'ftp://user:password@example.com/file.txt?download=true#details' );
    redactUrlMock.mockClear();
    isUrlMock.mockClear();
    isUrlMock.mockReturnValueOnce( true );

    expect( serializeError( {
      stringUrl,
      url
    } ) ).toEqual( {
      stringUrl: '[Redacted URL]',
      url: '[Redacted URL]'
    } );
    expect( isUrlMock ).toHaveBeenCalledOnce();
    expect( isUrlMock ).toHaveBeenCalledWith( stringUrl );
    expect( redactUrlMock ).toHaveBeenCalledTimes( 2 );
    expect( redactUrlMock ).toHaveBeenNthCalledWith( 1, stringUrl );
    expect( redactUrlMock ).toHaveBeenNthCalledWith( 2, url );
  } );

  it( 'truncates string values and property names', () => {
    const longValue = 'v'.repeat( 16_385 );
    const sharedKeyPrefix = 'k'.repeat( 256 );

    expect( serializeError( {
      longValue,
      [`${sharedKeyPrefix}a`]: 'first',
      [`${sharedKeyPrefix}b`]: 'second'
    } ) ).toEqual( {
      longValue: `${'v'.repeat( 16_384 )}... [1 more characters omitted]`,
      [`${sharedKeyPrefix}... [1 more characters omitted]`]: 'first'
    } );
  } );

  it( 'limits arrays, maps, and sets while recursively serializing their values', () => {
    const exactArray = Array.from( { length: 50 }, ( _, index ) => index );
    const longArray = Array.from( { length: 52 }, ( _, index ) => index );
    const longMap = new Map( Array.from( { length: 51 }, ( _, index ) => [ `key-${index}`, BigInt( index ) ] ) );
    const longSet = new Set( Array.from( { length: 52 }, ( _, index ) => BigInt( index ) ) );

    expect( serializeError( exactArray ) ).toEqual( exactArray );
    expect( serializeError( longArray ) ).toEqual( [ ...exactArray, '... [2 more items omitted]' ] );

    const serializedMap = serializeError( longMap );
    expect( serializedMap ).toHaveLength( 51 );
    expect( serializedMap[0] ).toEqual( [ 'key-0', '0n' ] );
    expect( serializedMap.at( -1 ) ).toBe( '... [1 more items omitted]' );

    const serializedSet = serializeError( longSet );
    expect( serializedSet ).toHaveLength( 51 );
    expect( serializedSet[0] ).toBe( '0n' );
    expect( serializedSet.at( -1 ) ).toBe( '... [2 more items omitted]' );
  } );

  it( 'globally limits object properties while prioritizing own properties', () => {
    const exactProperties = Object.fromEntries( Array.from( { length: 50 }, ( _, index ) => [ `property-${index}`, index ] ) );
    expect( serializeError( exactProperties ) ).toEqual( exactProperties );

    const prototype = { inherited: 'omitted' };
    const instance = Object.assign(
      Object.create( prototype ),
      Object.fromEntries( Array.from( { length: 50 }, ( _, index ) => [ `own-${index}`, index ] ) )
    );
    const serialized = serializeError( instance );

    expect( Object.keys( serialized ) ).toHaveLength( 51 );
    expect( serialized['own-49'] ).toBe( 49 );
    expect( serialized ).not.toHaveProperty( 'inherited' );
    expect( serialized['...'] ).toBe( '[Maximum Object Properties Reached]' );
  } );

  it( 'retains error identity when properties reach the object limit', () => {
    class DetailedError extends Error {}
    const error = new DetailedError( 'failed' );
    Object.assign( error, Object.fromEntries( Array.from( { length: 50 }, ( _, index ) => [ `field-${index}`, index ] ) ) );

    const serialized = serializeError( error, { dropKeys: [ 'stack' ] } );

    expect( serialized.name ).toBe( 'DetailedError' );
    expect( serialized.message ).toBe( 'failed' );
    expect( serialized['...'] ).toBe( '[Maximum Object Properties Reached]' );
  } );

  it( 'recursively excludes sensitive and internal properties while retaining similarly named diagnostics', () => {
    const value = {
      failure: { internal: 'Temporal protobuf' },
      originalFailure: { details: 'Nexus failure' },
      $type: { parent: 'protobuf reflection graph' },
      request: { body: 'private request' },
      response: { body: 'private response' },
      headers: { Authorization: 'Bearer secret' },
      Authorization: 'Bearer secret',
      RequestBodyValues: { prompt: 'private prompt' },
      RESPONSE_HEADERS: { Cookie: 'private cookie' },
      APIKey: 'private key',
      AccessToken: 'private token',
      PASSWORD: 'private password',
      Credential: 'private credential',
      keyboard: 'preserved',
      tokenCount: 42,
      passwordPolicy: 'preserved',
      secretCount: 1,
      nested: {
        Cookie: 'private cookie',
        code: 'EFAILED'
      }
    };

    expect( serializeError( value ) ).toEqual( {
      keyboard: 'preserved',
      tokenCount: 42,
      passwordPolicy: 'preserved',
      secretCount: 1,
      nested: { code: 'EFAILED' }
    } );
  } );

  it( 'includes stacks by default and supports dropping them recursively', () => {
    const cause = new Error( 'database unavailable' );
    const error = new Error( 'service failed', { cause } );

    const withStacks = serializeError( error );
    const withoutStacks = serializeError( error, { dropKeys: [ 'stack' ] } );

    expect( withStacks.stack ).toContain( 'Error: service failed' );
    expect( withStacks.cause.stack ).toContain( 'Error: database unavailable' );
    expect( withoutStacks ).not.toHaveProperty( 'stack' );
    expect( withoutStacks.cause ).not.toHaveProperty( 'stack' );
  } );

  it( 'marks circular references but serializes shared sibling values independently', () => {
    const shared = { code: 'ESHARED' };
    const objectCycle = {};
    objectCycle.self = objectCycle;
    const arrayCycle = [];
    arrayCycle.push( arrayCycle );
    const mapCycle = new Map();
    mapCycle.set( 'self', mapCycle );
    const setCycle = new Set();
    setCycle.add( setCycle );

    expect( serializeError( {
      objectCycle,
      arrayCycle,
      mapCycle,
      setCycle,
      first: shared,
      second: shared
    } ) ).toEqual( {
      objectCycle: { self: '[Circular Reference]' },
      arrayCycle: [ '[Circular Reference]' ],
      mapCycle: [ [ 'self', '[Circular Reference]' ] ],
      setCycle: [ '[Circular Reference]' ],
      first: { code: 'ESHARED' },
      second: { code: 'ESHARED' }
    } );
  } );

  it( 'marks values beyond the maximum recursive depth', () => {
    const createNestedValue = depth => depth === 0 ? {} : { child: createNestedValue( depth - 1 ) };
    const root = createNestedValue( 10 );

    expect(
      Array.from( { length: 9 } ).reduce( value => value.child, serializeError( root ) ).child
    ).toBe( '[Maximum Depth Reached]' );
  } );

  it( 'marks values after the total serialization limit is reached', () => {
    const value = Array.from(
      { length: 50 },
      () => Array.from( { length: 50 }, ( _, index ) => index )
    );

    expect( JSON.stringify( serializeError( value ) ) ).toContain( '[Serialization Limit Reached]' );
  } );

  it( 'returns an unserializable marker for exotic values that throw during reflection', () => {
    const { proxy, revoke } = Proxy.revocable( {}, {} );
    revoke();

    expect( serializeError( proxy ) ).toBe( '[Unserializable]' );
    expect( serializeError( { nested: proxy } ) ).toEqual( { nested: '[Unserializable]' } );
  } );
} );
