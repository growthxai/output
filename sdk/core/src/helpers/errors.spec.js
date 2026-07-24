import { describe, expect, it } from 'vitest';
import { inheritsFromAnyNamedType, serializeError } from './errors.js';

describe( 'serializeError', () => {
  it( 'serializes own descriptors while excluding unusable properties', () => {
    const error = new Error( 'step failed' );
    Object.defineProperties( error, {
      code: { value: 'ESTEP' },
      hidden: { value: 'available for debugging' },
      computed: { get: () => 'computed value' },
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

    const serialized = serializeError( error, { includeStack: false } );

    expect( serialized ).toMatchObject( {
      name: 'Error',
      message: 'step failed',
      code: 'ESTEP',
      hidden: 'available for debugging',
      computed: 'computed value',
      nullable: null,
      symbol: 'Symbol(debug)'
    } );
    expect( serialized ).not.toHaveProperty( 'stack' );
    expect( serialized ).not.toHaveProperty( 'broken' );
    expect( serialized ).not.toHaveProperty( 'callback' );
    expect( serialized ).not.toHaveProperty( 'skipped' );
    expect( Object.hasOwn( serialized, '__proto__' ) ).toBe( false );
  } );

  it( 'applies custom property exclusions recursively and across the prototype chain', () => {
    class DebugError extends Error {}
    DebugError.prototype.internal = 'prototype value';

    const cause = new DebugError( 'cause failed' );
    cause.context = { internal: 'nested cause value', visible: 'cause context' };
    const error = new DebugError( 'request failed', { cause } );
    error.internal = 'instance value';
    error.context = { internal: 'nested root value', visible: 'root context' };

    const serialized = serializeError( error, { excludeProps: [ 'internal' ] } );

    expect( serialized ).not.toHaveProperty( 'internal' );
    expect( serialized.context ).toEqual( { visible: 'root context' } );
    expect( serialized.cause ).not.toHaveProperty( 'internal' );
    expect( serialized.cause.context ).toEqual( { visible: 'cause context' } );
  } );

  it( 'merges three inheritance levels with the most specific properties taking precedence', () => {
    class BaseFailure extends Error {}
    BaseFailure.prototype.name = 'BaseFailure';
    BaseFailure.prototype.baseProperty = 'base';
    BaseFailure.prototype.overridden = 'base';

    class DomainFailure extends BaseFailure {}
    DomainFailure.prototype.name = 'DomainFailure';
    DomainFailure.prototype.domainProperty = 'domain';
    DomainFailure.prototype.overridden = 'domain';

    class RequestFailure extends DomainFailure {}
    RequestFailure.prototype.name = 'RequestFailure';
    RequestFailure.prototype.requestProperty = 'request';
    RequestFailure.prototype.overridden = 'request';

    const error = new RequestFailure( 'request failed' );
    error.instanceProperty = 'instance';
    error.overridden = 'instance';

    expect( serializeError( error ) ).toMatchObject( {
      name: 'RequestFailure',
      message: 'request failed',
      baseProperty: 'base',
      domainProperty: 'domain',
      requestProperty: 'request',
      instanceProperty: 'instance',
      overridden: 'instance'
    } );
  } );

  it( 'uses explicit, inherited, and constructor error names in precedence order', () => {
    class ConstructorNamedError extends Error {}
    class InheritedNamedError extends Error {}
    InheritedNamedError.prototype.name = 'InheritedName';
    class ExplicitlyNamedError extends Error {
      name = 'ExplicitName';
    }
    class ExplicitlyGenericError extends Error {
      name = 'Error';
    }

    const constructorNamed = serializeError( new ConstructorNamedError( 'outer', {
      cause: new ConstructorNamedError( 'inner' )
    } ) );
    expect( constructorNamed.name ).toBe( 'ConstructorNamedError' );
    expect( constructorNamed.cause.name ).toBe( 'ConstructorNamedError' );
    expect( serializeError( new InheritedNamedError() ).name ).toBe( 'InheritedName' );
    expect( serializeError( new ExplicitlyNamedError() ).name ).toBe( 'ExplicitName' );
    expect( serializeError( new ExplicitlyGenericError() ).name ).toBe( 'Error' );
    expect( serializeError( new Error() ).name ).toBe( 'Error' );
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

    expect( serializeError( serviceError ) ).toMatchObject( {
      message: 'service failed',
      cause: {
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

  it( 'renders inspectable scalar values as diagnostic strings', () => {
    expect( serializeError( 9_007_199_254_740_993n ) ).toBe( '9007199254740993n' );
    expect( serializeError( new Date( '2026-07-22T16:30:00.000Z' ) ) ).toBe( '2026-07-22T16:30:00.000Z' );
    expect( serializeError( new Date( 'invalid' ) ) ).toBe( 'Invalid Date' );
    expect( serializeError( /request-\d+/gi ) ).toBe( '/request-\\d+/gi' );
  } );

  it( 'truncates long inspected values', () => {
    const serialized = serializeError( 10n ** 16_384n );

    expect( serialized ).toHaveLength( 16_384 + '... 2 more characters'.length );
    expect( serialized ).toMatch( /^1[0]+[.]{3} 2 more characters$/ );
  } );

  it( 'handles top-level undefined, functions, and symbols', () => {
    function namedFunction() {}

    expect( serializeError( undefined ) ).toBeUndefined();
    expect( serializeError( namedFunction ) ).toBe( '[Function: namedFunction]' );
    expect( serializeError( function () {} ) ).toBe( '[Function (anonymous)]' );
    expect( serializeError( Symbol( 'request' ) ) ).toBe( 'Symbol(request)' );
    expect( serializeError( Symbol() ) ).toBe( 'Symbol()' );
  } );

  it( 'renders typed arrays and buffers without enumerating their elements', () => {
    expect( serializeError( new Uint16Array( [ 1, 2 ] ) ) ).toBe( 'Uint16Array(2) [ 1, 2 ]' );
    expect( serializeError( Buffer.from( [ 1, 2 ] ) ) ).toBe( 'Buffer(2) [Uint8Array] [ 1, 2 ]' );
    expect( serializeError( new Uint8Array( 52 ) ) ).toContain( '... 2 more items' );
  } );

  it( 'truncates long strings and property names', () => {
    const longValue = 'v'.repeat( 16_385 );
    const sharedKeyPrefix = 'k'.repeat( 256 );
    const value = {
      longValue,
      [`${sharedKeyPrefix}a`]: 'first',
      [`${sharedKeyPrefix}b`]: 'second'
    };

    expect( serializeError( longValue ) ).toBe( `${'v'.repeat( 16_384 )}... 1 more characters` );
    expect( serializeError( value ) ).toEqual( {
      longValue: `${'v'.repeat( 16_384 )}... 1 more characters`,
      [`${sharedKeyPrefix}... 1 more characters`]: 'first'
    } );
  } );

  it( 'limits arrays, maps, and sets while preserving recursive serialization', () => {
    const exactArray = Array.from( { length: 50 }, ( _, index ) => index );
    const exactMap = new Map( Array.from( { length: 50 }, ( _, index ) => [ `key-${index}`, index ] ) );
    const exactSet = new Set( Array.from( { length: 50 }, ( _, index ) => index ) );
    const longArray = Array.from( { length: 52 }, ( _, index ) => index );
    const longMap = new Map( Array.from( { length: 51 }, ( _, index ) => [ `key-${index}`, BigInt( index ) ] ) );
    const longSet = new Set( Array.from( { length: 52 }, ( _, index ) => BigInt( index ) ) );

    expect( serializeError( exactArray ) ).toEqual( exactArray );
    expect( serializeError( exactMap ) ).toHaveLength( 50 );
    expect( serializeError( exactSet ) ).toHaveLength( 50 );
    expect( serializeError( longArray ) ).toEqual( [ ...exactArray, '... 2 more items' ] );

    const serializedMap = serializeError( longMap );
    expect( serializedMap ).toHaveLength( 51 );
    expect( serializedMap[0] ).toEqual( [ 'key-0', '0n' ] );
    expect( serializedMap.at( -1 ) ).toBe( '... 1 more items' );

    const serializedSet = serializeError( longSet );
    expect( serializedSet ).toHaveLength( 51 );
    expect( serializedSet[0] ).toBe( '0n' );
    expect( serializedSet.at( -1 ) ).toBe( '... 2 more items' );
  } );

  it( 'limits serializable properties per prototype level', () => {
    const exactProperties = Object.fromEntries( Array.from( { length: 50 }, ( _, index ) => [ `property-${index}`, index ] ) );
    const skippedProperties = {
      request: 'excluded',
      callback: () => 'excluded',
      unavailable: undefined,
      ...Object.fromEntries( Array.from( { length: 51 }, ( _, index ) => [ `property-${index}`, index ] ) )
    };

    expect( serializeError( exactProperties ) ).toEqual( exactProperties );

    const serialized = serializeError( skippedProperties );
    expect( Object.keys( serialized ) ).toHaveLength( 51 );
    expect( serialized['property-49'] ).toBe( 49 );
    expect( serialized ).not.toHaveProperty( 'property-50' );
    expect( serialized['...'] ).toBe( 'possibly more properties' );

    const prototype = Object.fromEntries( Array.from( { length: 51 }, ( _, index ) => [ `inherited-${index}`, index ] ) );
    const instance = Object.assign(
      Object.create( prototype ),
      Object.fromEntries( Array.from( { length: 51 }, ( _, index ) => [ `own-${index}`, index ] ) )
    );
    const serializedInstance = serializeError( instance );

    expect( serializedInstance['inherited-49'] ).toBe( 49 );
    expect( serializedInstance['own-49'] ).toBe( 49 );
    expect( serializedInstance ).not.toHaveProperty( 'inherited-50' );
    expect( serializedInstance ).not.toHaveProperty( 'own-50' );
    expect( serializedInstance['...'] ).toBe( 'possibly more properties' );
  } );

  it( 'recursively excludes unsafe property names without removing similar diagnostics', () => {
    const symbolKey = Symbol( 'private metadata' );
    const value = {
      failure: { internal: 'Temporal protobuf' },
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
      },
      [symbolKey]: 'private symbol metadata'
    };

    expect( serializeError( value ) ).toEqual( {
      keyboard: 'preserved',
      tokenCount: 42,
      passwordPolicy: 'preserved',
      secretCount: 1,
      nested: { code: 'EFAILED' }
    } );
  } );

  it( 'includes root and cause stacks by default and allows excluding them', () => {
    const cause = new Error( 'database unavailable' );
    const error = new Error( 'service failed', { cause } );

    const withStacks = serializeError( error );
    const withoutStacks = serializeError( error, { includeStack: false } );

    expect( withoutStacks ).not.toHaveProperty( 'stack' );
    expect( withoutStacks.cause ).not.toHaveProperty( 'stack' );
    expect( withStacks.stack ).toContain( 'Error: service failed' );
    expect( withStacks.cause.stack ).toContain( 'Error: database unavailable' );
    expect( Object.hasOwn( withStacks, '__proto__' ) ).toBe( false );
  } );

  it( 'recursively converts Map entries and Set values', () => {
    const serializedMap = serializeError( new Map( [
      [ 'id', 42n ],
      [ { scope: 'request' }, new Date( '2026-07-22T16:30:00.000Z' ) ]
    ] ) );
    const serializedSet = serializeError( new Set( [ 'ENOTFOUND', 7n ] ) );

    expect( serializedMap[0] ).toEqual( [ 'id', '42n' ] );
    expect( serializedMap[1][0] ).toMatchObject( { scope: 'request' } );
    expect( serializedMap[1][1] ).toBe( '2026-07-22T16:30:00.000Z' );
    expect( serializedSet ).toEqual( [ 'ENOTFOUND', '7n' ] );
  } );

  it( 'bounds recursive object and array cycles at the maximum depth', () => {
    const descend = ( value, key, levels ) =>
      Array.from( { length: levels } ).reduce( current => current[key], value );
    const objectCycle = {};
    objectCycle.self = objectCycle;
    const arrayCycle = [];
    arrayCycle.push( arrayCycle );
    const mapCycle = new Map();
    mapCycle.set( 'self', mapCycle );
    const setCycle = new Set();
    setCycle.add( setCycle );
    const error = new Error( 'cyclic error' );
    error.objectCycle = objectCycle;
    error.arrayCycle = arrayCycle;
    error.mapCycle = mapCycle;
    error.setCycle = setCycle;

    const serialized = serializeError( error );

    expect( descend( serialized.objectCycle, 'self', 8 ) ).not.toBe( '[Max Depth]' );
    expect( descend( serialized.objectCycle, 'self', 9 ) ).toBe( '[Max Depth]' );
    expect( descend( serialized.arrayCycle, 0, 8 ) ).not.toBe( '[Max Depth]' );
    expect( descend( serialized.arrayCycle, 0, 9 ) ).toBe( '[Max Depth]' );
    expect( JSON.stringify( serialized.mapCycle ) ).toContain( '[Max Depth]' );
    expect( JSON.stringify( serialized.setCycle ) ).toContain( '[Max Depth]' );
    expect( () => JSON.stringify( serialized ) ).not.toThrow();
  } );
} );

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
