import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import { serializeBodyAndInferContentType, serializeFetchResponse } from './fetch.js';

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
