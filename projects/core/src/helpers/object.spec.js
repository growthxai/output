import { describe, it, expect, vi } from 'vitest';
import { assignImmutableProperty, clone, deepMerge, deepMergeWithResolver, isPlainObject, shuffleArray } from './object.js';

describe( 'clone', () => {
  it( 'produces a deep copy without shared references', () => {
    const original = { a: 1, nested: { b: 2 } };
    const copied = clone( original );

    copied.nested.b = 3;

    expect( original.nested.b ).toBe( 2 );
    expect( copied.nested.b ).toBe( 3 );
    expect( copied ).not.toBe( original );
  } );

  it( 'deep copies JSON-compatible arrays and objects', () => {
    const original = {
      arr: [ 1, { nested: true } ],
      str: 'value',
      bool: false,
      nil: null
    };
    const copied = clone( original );

    copied.arr[1].nested = false;

    expect( copied ).toEqual( {
      arr: [ 1, { nested: false } ],
      str: 'value',
      bool: false,
      nil: null
    } );
    expect( original.arr[1].nested ).toBe( true );
    expect( copied ).not.toBe( original );
    expect( copied.arr ).not.toBe( original.arr );
  } );

  it( 'returns primitive JSON values when they can be parsed', () => {
    expect( clone( null ) ).toBeNull();
    expect( clone( true ) ).toBe( true );
    expect( clone( false ) ).toBe( false );
    expect( clone( 123 ) ).toBe( 123 );
    expect( clone( 'hello' ) ).toBe( 'hello' );
  } );

  it( 'returns original values when JSON serialization produces no parseable payload', () => {
    const sym = Symbol( 'x' );
    const fn = () => {};
    class Foo {}

    expect( clone( undefined ) ).toBeUndefined();
    expect( clone( sym ) ).toBe( sym );
    expect( clone( fn ) ).toBe( fn );
    expect( clone( Foo ) ).toBe( Foo );
    expect( clone( Date ) ).toBe( Date );
    expect( clone( Object ) ).toBe( Object );
    expect( clone( Number ) ).toBe( Number );
  } );

  it( 'returns original values when JSON serialization throws', () => {
    const circular = { name: 'circular' };
    circular.self = circular;
    const bigint = 1n;

    expect( clone( circular ) ).toBe( circular );
    expect( clone( bigint ) ).toBe( bigint );
  } );

  it( 'keeps JSON.stringify semantics for special numeric values', () => {
    expect( clone( NaN ) ).toBeNull();
    expect( clone( Infinity ) ).toBeNull();
    expect( clone( -Infinity ) ).toBeNull();
  } );

  it( 'keeps JSON.stringify semantics for non-plain object instances', () => {
    const date = new Date( '2025-01-01T00:00:00.000Z' );

    expect( clone( date ) ).toBe( '2025-01-01T00:00:00.000Z' );
    expect( clone( /abc/ ) ).toEqual( {} );
    expect( clone( new Map( [ [ 'a', 1 ] ] ) ) ).toEqual( {} );
    expect( clone( new Set( [ 1, 2 ] ) ) ).toEqual( {} );
  } );

  it( 'drops object properties that JSON.stringify omits', () => {
    const sym = Symbol( 'x' );
    const original = {
      kept: 'yes',
      missing: undefined,
      fn: () => {},
      sym
    };

    expect( clone( original ) ).toEqual( { kept: 'yes' } );
  } );
} );

describe( 'deepMerge', () => {
  it( 'returns a clone when only the base object is provided', () => {
    const a = {
      nested: { value: 1 }
    };
    const result = deepMerge( a );

    a.nested.value = 2;

    expect( result ).toEqual( {
      nested: { value: 1 }
    } );
  } );

  it( 'Throws when first argument is not a plain object', () => {
    expect( () => deepMerge( null ) ).toThrow( Error );
  } );

  it( 'merges multiple objects from left to right using rightmost values', () => {
    expect( deepMerge(
      {
        a: 1,
        nested: {
          a: 'base',
          kept: true
        }
      },
      {
        b: 2,
        nested: {
          a: 'first',
          b: 'first'
        }
      },
      {
        a: 3,
        nested: {
          b: 'second',
          c: 'second'
        }
      }
    ) ).toEqual( {
      a: 3,
      b: 2,
      nested: {
        a: 'first',
        b: 'second',
        c: 'second',
        kept: true
      }
    } );
  } );

  it( 'ignores non-object values among multiple overlays', () => {
    expect( deepMerge(
      { a: 1 },
      null,
      { b: 2 },
      undefined,
      { a: 3 }
    ) ).toEqual( {
      a: 3,
      b: 2
    } );
  } );
} );

describe( 'deepMergeWithResolver', () => {
  it( 'returns a clone when only the base object and resolver are provided', () => {
    const a = {
      nested: { value: 1 }
    };
    const result = deepMergeWithResolver( a, ( x, y ) => x + y );

    a.nested.value = 2;

    expect( result ).toEqual( {
      nested: { value: 1 }
    } );
  } );

  it( 'uses resolver for existing leaf values, including nested leaves', () => {
    const a = {
      cost: { total: 1 },
      tokens: { total: 2, input: 3 }
    };
    const b = {
      cost: { total: 4 },
      tokens: { total: 5, input: 6, output: 7 }
    };

    expect( deepMergeWithResolver( a, b, ( x, y ) => x + y ) ).toEqual( {
      cost: { total: 5 },
      tokens: { total: 7, input: 9, output: 7 }
    } );
  } );

  it( 'copies values from "b" when they do not exist in "a"', () => {
    const resolver = vi.fn( ( x, y ) => x + y );

    expect( deepMergeWithResolver( { a: 1 }, { b: 2, nested: { c: 3 } }, resolver ) ).toEqual( {
      a: 1,
      b: 2,
      nested: { c: 3 }
    } );
    expect( resolver ).not.toHaveBeenCalled();
  } );

  it( 'keeps extra values from "a" when absent from "b"', () => {
    expect( deepMergeWithResolver( { a: 1, nested: { kept: 2 } }, { b: 3 }, ( x, y ) => x + y ) ).toEqual( {
      a: 1,
      nested: { kept: 2 },
      b: 3
    } );
  } );

  it( 'returns a clone of "a" when "b" is not an object', () => {
    const a = { nested: { value: 1 } };
    const result = deepMergeWithResolver( a, null, ( x, y ) => x + y );

    a.nested.value = 2;
    expect( result ).toEqual( { nested: { value: 1 } } );
  } );

  it( 'throws when first argument is not a plain object', () => {
    expect( () => deepMergeWithResolver( null, {}, ( x, y ) => x + y ) ).toThrow( Error );
    expect( () => deepMergeWithResolver( [], {}, ( x, y ) => x + y ) ).toThrow( Error );
    expect( () => deepMergeWithResolver( 'a', {}, ( x, y ) => x + y ) ).toThrow( Error );
  } );

  it( 'throws when last argument is not a resolver function', () => {
    expect( () => deepMergeWithResolver( { a: 1 }, { a: 2 } ) )
      .toThrow( 'Last argument (resolver) is not a function.' );
  } );

  it( 'merges multiple objects using the resolver from left to right', () => {
    const resolver = vi.fn( ( x, y ) => `${ x }:${ y }` );

    expect( deepMergeWithResolver(
      {
        a: 'base',
        nested: {
          count: 1,
          kept: 'yes'
        }
      },
      {
        a: 'first',
        nested: {
          count: 2,
          firstOnly: true
        }
      },
      {
        a: 'second',
        nested: {
          count: 3,
          secondOnly: true
        }
      },
      resolver
    ) ).toEqual( {
      a: 'base:first:second',
      nested: {
        count: '1:2:3',
        firstOnly: true,
        kept: 'yes',
        secondOnly: true
      }
    } );
    expect( resolver ).toHaveBeenCalledTimes( 4 );
  } );

  it( 'ignores non-object values among multiple resolver overlays', () => {
    const resolver = vi.fn( ( x, y ) => x + y );

    expect( deepMergeWithResolver(
      { a: 1 },
      null,
      { a: 2 },
      undefined,
      { b: 3 },
      resolver
    ) ).toEqual( {
      a: 3,
      b: 3
    } );
    expect( resolver ).toHaveBeenCalledOnce();
  } );
} );

describe( 'isPlainObject', () => {
  it( 'Detects plain objects', () => {
    expect( isPlainObject( {} ) ).toBe( true );
    expect( isPlainObject( { a: 1 } ) ).toBe( true );
    expect( isPlainObject( new Object() ) ).toBe( true );
    expect( isPlainObject( new Object( { foo: 'bar' } ) ) ).toBe( true );
    expect( isPlainObject( Object.create( {}.constructor.prototype ) ) ).toBe( true );
    expect( isPlainObject( Object.create( Object.prototype ) ) ).toBe( true );
  } );

  it( 'Detects plain objects with different prototypes than Object.prototype', () => {
    // Object with null prototype
    expect( isPlainObject( Object.create( null ) ) ).toBe( true );
  } );

  it( 'Detects non plain objects that had their __proto__ mutated to Object.prototype or null', () => {
    class Foo {}
    const x = new Foo();
    x.__proto__ = Object.prototype;
    expect( isPlainObject( x ) ).toBe( true );

    const y = new Foo();
    y.__proto__ = null;
    expect( isPlainObject( y ) ).toBe( true );
  } );

  it( 'Returns false for object which the prototype is not Object.prototype or null', () => {
    // Object which the prototype is a plain {}
    expect( isPlainObject( Object.create( {} ) ) ).toBe( false );
    // Object which prototype is a another object with null prototype
    expect( isPlainObject( Object.create( Object.create( null ) ) ) ).toBe( false );
  } );

  it( 'Returns false for functions', () => {
    expect( isPlainObject( Function ) ).toBe( false );
    expect( isPlainObject( () => {} ) ).toBe( false );
    expect( isPlainObject( class Foo {} ) ).toBe( false );
    expect( isPlainObject( Number.constructor ) ).toBe( false );
    expect( isPlainObject( Number.constructor.prototype ) ).toBe( false );
  } );

  it( 'Returns false for arrays', () => {
    expect( isPlainObject( [ 1, 2, 3 ] ) ).toBe( false );
    expect( isPlainObject( [] ) ).toBe( false );
    expect( isPlainObject( Array( 3 ) ) ).toBe( false );
  } );

  it( 'Returns false for primitives', () => {
    expect( isPlainObject( null ) ).toBe( false );
    expect( isPlainObject( undefined ) ).toBe( false );
    expect( isPlainObject( false ) ).toBe( false );
    expect( isPlainObject( true ) ).toBe( false );
    expect( isPlainObject( 1 ) ).toBe( false );
    expect( isPlainObject( 0 ) ).toBe( false );
    expect( isPlainObject( '' ) ).toBe( false );
    expect( isPlainObject( 'foo' ) ).toBe( false );
    expect( isPlainObject( Symbol( 'foo' ) ) ).toBe( false );
    expect( isPlainObject( Symbol.for( 'foo' ) ) ).toBe( false );
  } );

  it( 'Returns true for built in objects', () => {
    expect( isPlainObject( Math ) ).toBe( true );
    expect( isPlainObject( JSON ) ).toBe( true );
  } );

  it( 'Returns false for built in types', () => {
    expect( isPlainObject( String ) ).toBe( false );
    expect( isPlainObject( Number ) ).toBe( false );
    expect( isPlainObject( Date ) ).toBe( false );
  } );

  it( 'Returns false for other instance where prototype is not object or null', () => {
    expect( isPlainObject( /foo/ ) ).toBe( false );
    expect( isPlainObject( new RegExp( 'foo' ) ) ).toBe( false );
    expect( isPlainObject( new Date() ) ).toBe( false );
    class Foo {}
    expect( isPlainObject( new Foo() ) ).toBe( false );
    expect( isPlainObject( Object.create( ( class Foo {} ).prototype ) ) ).toBe( false );
  } );

  it( 'Returns false if tries to change the prototype to simulate an object', () => {
    function Bar() {}
    Bar.prototype = Object.create( null );
    expect( isPlainObject( new Bar() ) ).toBe( false );
  } );

  it( 'Returns false if object proto was mutated to anything else than object or null', () => {
    const zum = {};
    zum.__proto__ = Number.prototype;
    expect( isPlainObject( zum ) ).toBe( false );
  } );
} );

describe( 'assignImmutableProperty', () => {
  it( 'defines a non-writable, non-configurable, non-enumerable property', () => {
    const obj = {};
    const key = Symbol( 'metadata' );
    const value = { name: 'test' };

    expect( assignImmutableProperty( obj, key, value ) ).toBe( obj );
    expect( obj[key] ).toBe( value );
    expect( Object.getOwnPropertyDescriptor( obj, key ) ).toEqual( {
      value,
      writable: false,
      configurable: false,
      enumerable: false
    } );
    expect( Object.keys( obj ) ).toEqual( [] );
  } );

  it( 'prevents reassignment and redefinition', () => {
    const obj = {};
    const key = 'metadata';

    assignImmutableProperty( obj, key, 'original' );

    expect( () => {
      obj[key] = 'updated';
    } ).toThrow( TypeError );
    expect( () => {
      Object.defineProperty( obj, key, { value: 'updated' } );
    } ).toThrow( TypeError );
    expect( obj[key] ).toBe( 'original' );
  } );
} );

describe( 'shuffleArray', () => {
  it( 'returns a shuffled copy based on random sort keys', () => {
    vi.spyOn( Math, 'random' )
      .mockReturnValueOnce( 0.4 )
      .mockReturnValueOnce( 0.1 )
      .mockReturnValueOnce( 0.3 );
    const arr = [ 'a', 'b', 'c' ];

    expect( shuffleArray( arr ) ).toEqual( [ 'b', 'c', 'a' ] );
    expect( arr ).toEqual( [ 'a', 'b', 'c' ] );
  } );
} );
