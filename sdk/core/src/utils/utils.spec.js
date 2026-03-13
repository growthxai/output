import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import {
  clone,
  serializeBodyAndInferContentType,
  serializeFetchResponse,
  deepMerge,
  isPlainObject,
  toUrlSafeBase64
} from './utils.js';

describe( 'clone', () => {
  it( 'produces a deep copy without shared references', () => {
    const original = { a: 1, nested: { b: 2 } };
    const copied = clone( original );

    copied.nested.b = 3;

    expect( original.nested.b ).toBe( 2 );
    expect( copied.nested.b ).toBe( 3 );
    expect( copied ).not.toBe( original );
  } );
} );

describe( 'serializeFetchResponse', () => {
  it( 'serializes JSON response body and flattens headers', async () => {
    const payload = { a: 1, b: 'two' };
    const response = new Response( JSON.stringify( payload ), {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' }
    } );

    const result = await serializeFetchResponse( response );
    expect( result.status ).toBe( 200 );
    expect( result.ok ).toBe( true );
    expect( result.statusText ).toBe( 'OK' );
    expect( result.headers['content-type'] ).toContain( 'application/json' );
    expect( result.body ).toEqual( payload );
  } );

  it( 'serializes text/* response via text()', async () => {
    const bodyText = 'hello world';
    const response = new Response( bodyText, {
      status: 201,
      statusText: 'Created',
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    } );

    const result = await serializeFetchResponse( response );
    expect( result.status ).toBe( 201 );
    expect( result.ok ).toBe( true );
    expect( result.statusText ).toBe( 'Created' );
    expect( result.headers['content-type'] ).toContain( 'text/plain' );
    expect( result.body ).toBe( bodyText );
  } );

  if ( typeof ReadableStream !== 'undefined' ) {
    it( 'serializes ReadableStream body for text/* via text()', async () => {
      const encoder = new TextEncoder();
      const chunk = encoder.encode( 'streamed text' );
      const stream = new ReadableStream( {
        start( controller ) {
          controller.enqueue( chunk );
          controller.close();
        }
      } );
      const response = new Response( stream, {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/plain; charset=utf-8' }
      } );

      const result = await serializeFetchResponse( response );
      expect( result.status ).toBe( 200 );
      expect( result.ok ).toBe( true );
      expect( result.statusText ).toBe( 'OK' );
      expect( result.headers['content-type'] ).toContain( 'text/plain' );
      expect( result.body ).toBe( 'streamed text' );
    } );
  }

  it( 'serializes non-text/non-json response as base64 from arrayBuffer()', async () => {
    const bytes = Uint8Array.from( [ 0, 1, 2, 3 ] );
    const response = new Response( bytes, {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/octet-stream' }
    } );

    const result = await serializeFetchResponse( response );
    expect( result.status ).toBe( 200 );
    expect( result.ok ).toBe( true );
    expect( result.statusText ).toBe( 'OK' );
    expect( result.headers['content-type'] ).toBe( 'application/octet-stream' );
    expect( result.body ).toBe( Buffer.from( bytes ).toString( 'base64' ) );
  } );

  it( 'defaults to base64 when content-type header is missing', async () => {
    const bytes = Uint8Array.from( [ 0, 1, 2, 3 ] );
    const response = new Response( bytes, { status: 200 } );
    // No headers set; content-type resolves to ''

    const result = await serializeFetchResponse( response );
    expect( result.headers['content-type'] ?? '' ).toBe( '' );
    expect( result.body ).toBe( Buffer.from( bytes ).toString( 'base64' ) );
  } );
} );

describe( 'serializeBodyAndInferContentType', () => {
  it( 'returns undefineds for null payload', () => {
    const { body, contentType } = serializeBodyAndInferContentType( null );
    expect( body ).toBeUndefined();
    expect( contentType ).toBeUndefined();
  } );

  it( 'returns undefineds for undefined payload', () => {
    const { body, contentType } = serializeBodyAndInferContentType( undefined );
    expect( body ).toBeUndefined();
    expect( contentType ).toBeUndefined();
  } );

  it( 'handles ArrayBuffer with octet-stream', () => {
    const buf = new ArrayBuffer( 4 );
    const { body, contentType } = serializeBodyAndInferContentType( buf );
    expect( body ).toBe( buf );
    expect( contentType ).toBe( 'application/octet-stream' );
  } );

  it( 'handles TypedArray with octet-stream', () => {
    const view = new Uint8Array( [ 1, 2, 3 ] );
    const { body, contentType } = serializeBodyAndInferContentType( view );
    expect( body ).toBe( view );
    expect( contentType ).toBe( 'application/octet-stream' );
  } );

  it( 'handles DataView with octet-stream', () => {
    const ab = new ArrayBuffer( 2 );
    const dv = new DataView( ab );
    const { body, contentType } = serializeBodyAndInferContentType( dv );
    expect( body ).toBe( dv );
    expect( contentType ).toBe( 'application/octet-stream' );
  } );

  // Environment-provided web types
  if ( typeof URLSearchParams !== 'undefined' ) {
    it( 'passes through URLSearchParams without content type', () => {
      const usp = new URLSearchParams( { a: '1', b: 'two' } );
      const { body, contentType } = serializeBodyAndInferContentType( usp );
      expect( body ).toBe( usp );
      expect( contentType ).toBeUndefined();
    } );
  }

  if ( typeof FormData !== 'undefined' ) {
    it( 'passes through FormData without content type', () => {
      const fd = new FormData();
      fd.append( 'a', '1' );
      const { body, contentType } = serializeBodyAndInferContentType( fd );
      expect( body ).toBe( fd );
      expect( contentType ).toBeUndefined();
    } );
  }

  if ( typeof Blob !== 'undefined' ) {
    it( 'passes through Blob without content type', () => {
      const blob = new Blob( [ 'abc' ], { type: 'text/plain' } );
      const { body, contentType } = serializeBodyAndInferContentType( blob );
      expect( body ).toBe( blob );
      expect( contentType ).toBeUndefined();
    } );
  }

  if ( typeof File !== 'undefined' ) {
    it( 'passes through File without content type', () => {
      const file = new File( [ 'abc' ], 'a.txt', { type: 'text/plain' } );
      const { body, contentType } = serializeBodyAndInferContentType( file );
      expect( body ).toBe( file );
      expect( contentType ).toBeUndefined();
    } );
  }

  it( 'passes through async iterator without content type', () => {
    const asyncIter = ( async function *() {
      yield 'chunk';
    } )();
    const { body, contentType } = serializeBodyAndInferContentType( asyncIter );
    expect( typeof body[Symbol.asyncIterator] ).toBe( 'function' );
    expect( contentType ).toBeUndefined();
  } );

  it( 'passes through Node Readable without content type', () => {
    const readable = Readable.from( [ 'a', 'b' ] );
    const { body, contentType } = serializeBodyAndInferContentType( readable );
    expect( body ).toBe( readable );
    expect( contentType ).toBeUndefined();
  } );

  it( 'serializes plain object as JSON with JSON content type', () => {
    const input = { a: 1, b: 'two' };
    const { body, contentType } = serializeBodyAndInferContentType( input );
    expect( body ).toBe( JSON.stringify( input ) );
    expect( contentType ).toBe( 'application/json; charset=UTF-8' );
  } );

  it( 'serializes string primitive with text/plain content type', () => {
    const { body, contentType } = serializeBodyAndInferContentType( 'hello' );
    expect( body ).toBe( 'hello' );
    expect( contentType ).toBe( 'text/plain; charset=UTF-8' );
  } );

  it( 'serializes number primitive with text/plain content type', () => {
    const { body, contentType } = serializeBodyAndInferContentType( 42 );
    expect( body ).toBe( '42' );
    expect( contentType ).toBe( 'text/plain; charset=UTF-8' );
  } );

  it( 'serializes boolean primitive with text/plain content type', () => {
    const { body, contentType } = serializeBodyAndInferContentType( true );
    expect( body ).toBe( 'true' );
    expect( contentType ).toBe( 'text/plain; charset=UTF-8' );
  } );
} );

describe( 'deepMerge', () => {
  it( 'Overwrites properties in object "a"', () => {
    const a = {
      a: 1,
      b: {
        c: 2
      }
    };
    const b = {
      a: false,
      b: {
        c: true
      }
    };
    expect( deepMerge( a, b ) ).toEqual( {
      a: false,
      b: {
        c: true
      }
    } );
  } );

  it( 'Adds properties existing in "b" but absent in "a"', () => {
    const a = {
      a: 1
    };
    const b = {
      a: false,
      b: true
    };
    expect( deepMerge( a, b ) ).toEqual( {
      a: false,
      b: true
    } );
  } );

  it( 'Keep extra properties in "a"', () => {
    const a = {
      a: 1
    };
    const b = {
      b: true
    };
    expect( deepMerge( a, b ) ).toEqual( {
      a: 1,
      b: true
    } );
  } );

  it( 'Merge object is a clone', () => {
    const a = {
      a: 1
    };
    const b = {
      b: 1
    };
    const result = deepMerge( a, b );
    a.a = 2;
    b.b = 2;
    expect( result.a ).toEqual( 1 );
  } );

  it( 'Returns copy of "a" if "b" is not an object', () => {
    const a = {
      a: 1
    };
    expect( deepMerge( a, null ) ).toEqual( { a: 1 } );
    expect( deepMerge( a, undefined ) ).toEqual( { a: 1 } );
  } );

  it( 'Copy of object "a" is a clone', () => {
    const a = {
      a: 1
    };
    const result = deepMerge( a, null );
    a.a = 2;
    expect( result.a ).toEqual( 1 );
  } );

  it( 'Throws when first argument is not a plain object', () => {
    expect( () => deepMerge( Function ) ).toThrow( Error );
    expect( () => deepMerge( () => {} ) ).toThrow( Error );
    expect( () => deepMerge( 'a' ) ).toThrow( Error );
    expect( () => deepMerge( true ) ).toThrow( Error );
    expect( () => deepMerge( /a/ ) ).toThrow( Error );
    expect( () => deepMerge( [] ) ).toThrow( Error );
    expect( () => deepMerge( class Foo {}, class Foo {} ) ).toThrow( Error );
    expect( () => deepMerge( Number.constructor, Number.constructor ) ).toThrow( Error );
    expect( () => deepMerge( Number.constructor.prototype, Number.constructor.prototype ) ).toThrow( Error );
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

describe( 'toUrlSafeBase64', () => {
  const urlSafeAlphabet = /^[A-Za-z0-9_-]+$/;

  it( 'returns a string for a valid UUID', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect( typeof toUrlSafeBase64( uuid ) ).toBe( 'string' );
    expect( toUrlSafeBase64( uuid ).length ).toBeGreaterThan( 0 );
  } );

  it( 'output length is 21 or 22 for a standard UUID', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const out = toUrlSafeBase64( uuid );
    expect( out.length ).toBeGreaterThanOrEqual( 21 );
    expect( out.length ).toBeLessThanOrEqual( 22 );
  } );

  it( 'output contains only url-safe alphabet characters', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const out = toUrlSafeBase64( uuid );
    expect( out ).toMatch( urlSafeAlphabet );
  } );

  it( 'is deterministic for the same UUID', () => {
    const uuid = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    expect( toUrlSafeBase64( uuid ) ).toBe( toUrlSafeBase64( uuid ) );
  } );

  it( 'different UUIDs produce different strings', () => {
    const a = toUrlSafeBase64( '550e8400-e29b-41d4-a716-446655440000' );
    const b = toUrlSafeBase64( '6ba7b810-9dad-11d1-80b4-00c04fd430c8' );
    expect( a ).not.toBe( b );
  } );

  it( 'strips hyphens and encodes hex (same as 32-char hex)', () => {
    const withHyphens = '550e8400-e29b-41d4-a716-446655440000';
    const hexOnly = '550e8400e29b41d4a716446655440000';
    expect( toUrlSafeBase64( withHyphens ) ).toBe( toUrlSafeBase64( hexOnly ) );
  } );
} );
