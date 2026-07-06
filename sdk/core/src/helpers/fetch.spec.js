import { afterEach, describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import { hydrateHeaders, redactHeaders, serializeBodyAndInferContentType, serializeResponse } from './fetch.js';

describe( 'redactHeaders', () => {
  it( 'redacts sensitive header names', () => {
    const result = redactHeaders( {
      Authorization: 'Bearer token',
      'X-Api-Key': 'api-key',
      Cookie: 'session=id',
      'x-client-secret': 'secret'
    } );

    expect( result ).toEqual( {
      Authorization: '[REDACTED]',
      'X-Api-Key': '[REDACTED]',
      Cookie: '[REDACTED]',
      'x-client-secret': '[REDACTED]'
    } );
  } );

  it( 'preserves non-sensitive header names and ignored false positives', () => {
    const result = redactHeaders( {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-csrf-token': 'csrf-token',
      'public-key-pins': 'pin'
    } );

    expect( result ).toEqual( {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-csrf-token': 'csrf-token',
      'public-key-pins': 'pin'
    } );
  } );

  it( 'handles empty headers', () => {
    expect( redactHeaders( {} ) ).toEqual( {} );
  } );
} );

describe( 'hydrateHeaders', () => {
  afterEach( () => {
    delete process.env.TOKEN;
    delete process.env.API_KEY;
  } );

  it( 'replaces environment variable tokens in header values', () => {
    process.env.TOKEN = 'secret-token';

    expect( hydrateHeaders( {
      Authorization: 'Bearer $TOKEN'
    } ) ).toEqual( {
      Authorization: 'Bearer secret-token'
    } );
  } );

  it( 'replaces repeated and multiple environment variable tokens', () => {
    process.env.TOKEN = 'secret-token';
    process.env.API_KEY = 'api-key';

    expect( hydrateHeaders( {
      Authorization: 'Bearer $TOKEN',
      'X-Composite': '$TOKEN:$API_KEY:$TOKEN'
    } ) ).toEqual( {
      Authorization: 'Bearer secret-token',
      'X-Composite': 'secret-token:api-key:secret-token'
    } );
  } );

  it( 'preserves headers without environment variable tokens', () => {
    expect( hydrateHeaders( {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    } ) ).toEqual( {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    } );
  } );

  it( 'handles missing headers', () => {
    expect( hydrateHeaders() ).toEqual( {} );
  } );

  it( 'throws when an environment variable token is missing', () => {
    expect( () => hydrateHeaders( {
      Authorization: 'Bearer $TOKEN'
    } ) ).toThrow( 'Missing environment variable "TOKEN" while hydrating headers.' );
  } );
} );

describe( 'serializeResponse', () => {
  it( 'serializes response metadata by default', async () => {
    const response = new Response( '{not json', {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' }
    } );

    await expect( serializeResponse( response ) ).resolves.toEqual( {
      url: '',
      status: 200,
      statusText: 'OK',
      ok: true
    } );
  } );

  it( 'includes redacted headers when requested', async () => {
    const response = new Response( null, {
      status: 204,
      statusText: 'No Content',
      headers: {
        authorization: 'Bearer token',
        'content-type': 'application/json'
      }
    } );

    const result = await serializeResponse( response, { includeHeaders: true } );

    expect( result ).toEqual( {
      url: '',
      status: 204,
      statusText: 'No Content',
      ok: true,
      headers: {
        authorization: '[REDACTED]',
        'content-type': 'application/json'
      }
    } );
  } );

  it( 'includes JSON body when requested', async () => {
    const payload = { a: 1, b: 'two' };
    const response = new Response( JSON.stringify( payload ), {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' }
    } );

    const result = await serializeResponse( response, { includeBody: true } );

    expect( result.body ).toEqual( payload );
  } );

  it( 'includes structured syntax JSON body when requested', async () => {
    const payload = { error: 'Invalid input' };
    const response = new Response( JSON.stringify( payload ), {
      status: 400,
      statusText: 'Bad Request',
      headers: { 'content-type': 'application/problem+json; charset=utf-8' }
    } );

    const result = await serializeResponse( response, { includeBody: true } );

    expect( result.body ).toEqual( payload );
  } );

  it( 'includes text body when requested', async () => {
    const bodyText = 'hello world';
    const response = new Response( bodyText, {
      status: 201,
      statusText: 'Created',
      headers: { 'content-type': 'Text/Plain; charset=utf-8' }
    } );

    const result = await serializeResponse( response, { includeBody: true } );

    expect( result.body ).toBe( bodyText );
  } );

  if ( typeof ReadableStream !== 'undefined' ) {
    it( 'includes ReadableStream text body when requested', async () => {
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

      const result = await serializeResponse( response, { includeBody: true } );

      expect( result.body ).toBe( 'streamed text' );
    } );
  }

  it( 'includes non-text non-json response as base64 when requested', async () => {
    const bytes = Uint8Array.from( [ 0, 1, 2, 3 ] );
    const response = new Response( bytes, {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/octet-stream' }
    } );

    const result = await serializeResponse( response, { includeBody: true } );

    expect( result.body ).toBe( Buffer.from( bytes ).toString( 'base64' ) );
  } );

  it( 'defaults to base64 body when content-type header is missing and body is requested', async () => {
    const bytes = Uint8Array.from( [ 0, 1, 2, 3 ] );
    const response = new Response( bytes, { status: 200 } );

    const result = await serializeResponse( response, { includeBody: true } );

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
