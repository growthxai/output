import { describe, it, expect } from 'vitest';
import { Response, Request, Headers } from 'undici';
import { parseBody, redactHeaders, serializeError } from './utils.js';

const createMultiLevelError = ( levels : number, depth : number = 1 ) : Error =>
  depth === levels ?
    new Error( `level-${depth}` ) :
    new Error( `level-${depth}`, { cause: createMultiLevelError( levels, depth + 1 ) } );

type SerializedError = ReturnType<typeof serializeError>;

const walkSerializedCause = ( root : SerializedError, steps : number ) : SerializedError => {
  if ( steps === 0 ) {
    return root;
  }
  return walkSerializedCause( root.cause as SerializedError, steps - 1 );
};

describe( 'fetch/utils', () => {
  describe( 'serializeError', () => {
    it( 'serializes name, message, stack and sets code and cause to undefined when absent', () => {
      const err = new Error( 'boom' );
      expect( serializeError( err ) ).toEqual( { name: 'Error', message: 'boom', stack: err.stack, code: undefined, cause: undefined } );
    } );

    it( 'uses the subclass constructor name', () => {
      const err = new TypeError( 'bad type' );

      expect( serializeError( err ).name ).toBe( 'TypeError' );
      expect( serializeError( err ).message ).toBe( 'bad type' );
    } );

    it( 'includes string code when set on the error', () => {
      const err = new Error( 'e' ) as Error & { code?: string };
      err.code = 'ENOENT';

      expect( serializeError( err ).code ).toBe( 'ENOENT' );
    } );

    it( 'serializes Error cause as a nested plain object', () => {
      const root = new Error( 'root' );
      const leaf = new TypeError( 'leaf' );
      root.cause = leaf;

      expect( serializeError( root ) ).toEqual( {
        name: 'Error',
        message: 'root',
        stack: root.stack,
        code: undefined,
        cause: {
          name: 'TypeError',
          message: 'leaf',
          stack: leaf.stack,
          code: undefined,
          cause: undefined
        }
      } );
    } );

    it( 'does not recurse into cause when initial depth is already past the limit', () => {
      const inner = new Error( 'inner' );
      const outer = new Error( 'outer' );
      outer.cause = inner;

      expect( serializeError( outer, 6 ).cause ).toBe( '<Max recursion depth reached>' );
    } );

    it( 'serializes up to five nested Error causes without hitting the sentinel', () => {
      const root = createMultiLevelError( 5 );
      const innermost = walkSerializedCause( serializeError( root ), 4 );

      expect( innermost.message ).toBe( 'level-5' );
      expect( innermost.cause ).toBeUndefined();
    } );

    it( 'replaces cause with the max-depth sentinel on the sixth nested Error', () => {
      const root = createMultiLevelError( 6 );
      const innermost = walkSerializedCause( serializeError( root ), 5 );

      expect( innermost.message ).toBe( 'level-6' );
      expect( innermost.cause ).toBe( '<Max recursion depth reached>' );
    } );

    it( 'does not expose a seventh error when the chain is longer than the limit', () => {
      const root = createMultiLevelError( 7 );
      const innermost = walkSerializedCause( serializeError( root ), 5 );

      expect( innermost.message ).toBe( 'level-6' );
      expect( innermost.cause ).toBe( '<Max recursion depth reached>' );
    } );
  } );

  describe( 'redactHeaders', () => {
    it( 'redacts sensitive headers case-insensitively', () => {
      const headers = new Headers( [
        [ 'Authorization', 'Bearer token123' ],
        [ 'X-API-Key', 'secret-key' ],
        [ 'apikey', 'another-secret' ],
        [ 'X-Auth-Token', 'auth-token' ],
        [ 'Secret-Header', 'top-secret' ],
        [ 'Password', 'password123' ],
        [ 'Private-Key', 'private-key-data' ],
        [ 'Cookie', 'session=abc123' ],
        [ 'Content-Type', 'application/json' ],
        [ 'User-Agent', 'test-agent' ]
      ] );

      expect( redactHeaders( headers ) ).toEqual( {
        authorization: '[REDACTED]',
        'x-api-key': '[REDACTED]',
        apikey: '[REDACTED]',
        'x-auth-token': '[REDACTED]',
        'secret-header': '[REDACTED]',
        password: '[REDACTED]',
        'private-key': '[REDACTED]',
        cookie: '[REDACTED]',
        'content-type': 'application/json',
        'user-agent': 'test-agent'
      } );
    } );

    it( 'leaves non-sensitive headers unchanged', () => {
      const headers = new Headers( {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Cache-Control': 'no-cache'
      } );
      expect( redactHeaders( headers ) ).toEqual( {
        'content-type': 'application/json',
        accept: 'application/json',
        'cache-control': 'no-cache'
      } );
    } );

    it( 'handles empty Headers', () => {
      expect( redactHeaders( new Headers() ) ).toEqual( {} );
    } );

    it( 'redacts sensitive keys even when values are empty', () => {
      const headers = new Headers( [
        [ 'Authorization', '' ],
        [ 'Content-Type', 'application/json' ],
        [ 'X-API-Key', '' ]
      ] );
      expect( redactHeaders( headers ) ).toEqual( {
        authorization: '[REDACTED]',
        'content-type': 'application/json',
        'x-api-key': '[REDACTED]'
      } );
    } );

    it( 'does not redact benign names that only contained sensitive substrings before', () => {
      const headers = new Headers( {
        Keyboard: 'qwerty',
        Secretary: 'admin',
        Tokens: 'abc123',
        'Content-Length': '123'
      } );
      expect( redactHeaders( headers ) ).toEqual( {
        keyboard: 'qwerty',
        secretary: 'admin',
        tokens: 'abc123',
        'content-length': '123'
      } );
    } );

    it( 'does not redact exempt headers but still redacts any header whose name contains a key segment', () => {
      const headers = new Headers( [
        [ 'X-Csrf-Token', 'abc' ],
        [ 'Public-Key-Pins', 'pin-sha256=dummy' ],
        [ 'ratelimit-tokens-left', '9' ],
        [ 'Cache-Key', 'lookup-1' ],
        [ 'X-Auth-Token', 'real-secret' ]
      ] );
      expect( redactHeaders( headers ) ).toEqual( {
        'x-csrf-token': 'abc',
        'public-key-pins': 'pin-sha256=dummy',
        'ratelimit-tokens-left': '9',
        'cache-key': '[REDACTED]',
        'x-auth-token': '[REDACTED]'
      } );
    } );

    describe( 'key suffix pattern /key(?![a-z0-9])/i', () => {
      it.each( [
        [ 'x-api-key', 'hyphen before key at end' ],
        [ 'apikey', 'single segment ending in key' ],
        [ 'X-LicenseKey', 'camel segment ending in Key' ],
        [ 'webhook-signing-key', 'key before end' ],
        [ 'pre-key-post', 'key surrounded by hyphens' ],
        [ 'encryption_key', 'underscore after key' ],
        [ 'signing-key-id', 'key in middle of kebab name' ],
        [ 'monkey', 'key followed by end of string (substring key)' ],
        [ 'turkey-vulture', 'key in first segment before hyphen' ],
        [ 'v1__key', 'non-alnum before key' ]
      ] )( 'redacts %s (%s)', headerName => {
        const headers = new Headers( [ [ headerName, 'secret-value' ] ] );
        const out = redactHeaders( headers );
        const canonical = Object.keys( out )[0];
        expect( out[canonical] ).toBe( '[REDACTED]' );
      } );

      it.each( [
        [ 'keyboard', 'key followed by letter b' ],
        [ 'KeyAccountId', 'key followed by letter a' ],
        [ 'WhiskeyBar', 'key followed by letter b' ],
        [ 'my-keyring', 'key followed by letter r' ],
        [ 'Cache-Control', 'no key substring with allowed lookahead' ]
      ] )( 'does not redact %s (%s)', headerName => {
        const headers = new Headers( [ [ headerName, 'visible' ] ] );
        const out = redactHeaders( headers );
        const canonical = Object.keys( out )[0];
        expect( out[canonical] ).toBe( 'visible' );
      } );

      it( 'still applies exempt list when the key rule would match (e.g. public-key-pins)', () => {
        const headers = new Headers( [ [ 'Public-Key-Pins', 'pins-value' ] ] );
        expect( redactHeaders( headers ) ).toEqual( { 'public-key-pins': 'pins-value' } );
      } );
    } );
  } );

  describe( 'parseBody', () => {
    it( 'parses JSON when content-type is application/json', async () => {
      const response = new Response( JSON.stringify( { ok: true } ), {
        headers: { 'content-type': 'application/json' }
      } );
      await expect( parseBody( response ) ).resolves.toEqual( { ok: true } );
    } );

    it( 'parses JSON when content-type includes charset', async () => {
      const response = new Response( JSON.stringify( [ 1, 2 ] ), {
        headers: { 'content-type': 'application/json; charset=utf-8' }
      } );
      await expect( parseBody( response ) ).resolves.toEqual( [ 1, 2 ] );
    } );

    it( 'returns text when content-type is not JSON', async () => {
      const response = new Response( 'hello', {
        headers: { 'content-type': 'text/plain' }
      } );
      await expect( parseBody( response ) ).resolves.toBe( 'hello' );
    } );

    it( 'uses text branch when content-type is missing', async () => {
      const response = new Response( 'plain' );
      await expect( parseBody( response ) ).resolves.toBe( 'plain' );
    } );

    it( 'returns empty string for empty body (text)', async () => {
      const response = new Response( '', { headers: { 'content-type': 'text/plain' } } );
      await expect( parseBody( response ) ).resolves.toBe( '' );
    } );

    it( 'returns empty string for empty body even when content-type is application/json', async () => {
      const response = new Response( '', { headers: { 'content-type': 'application/json' } } );
      await expect( parseBody( response ) ).resolves.toBe( '' );
    } );

    it( 'returns raw text when content-type is application/json but the body is not valid JSON', async () => {
      const raw = '{ not json';
      const response = new Response( raw, { headers: { 'content-type': 'application/json' } } );
      const result = await parseBody( response );
      expect( result ).toBe( raw );
      expect( result ).toBeTypeOf( 'string' );
    } );

    it( 'does not consume the original body (clone)', async () => {
      const response = new Response( 'read-me', { headers: { 'content-type': 'text/plain' } } );
      await parseBody( response );
      await expect( response.text() ).resolves.toBe( 'read-me' );
    } );

    it( 'parses JSON Request body', async () => {
      const request = new Request( 'https://ex.com', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify( { a: 1 } )
      } );
      await expect( parseBody( request ) ).resolves.toEqual( { a: 1 } );
    } );

    it( 'returns raw text for invalid JSON on a Request with application/json', async () => {
      const raw = '{';
      const request = new Request( 'https://ex.com', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: raw
      } );
      await expect( parseBody( request ) ).resolves.toBe( raw );
    } );
  } );
} );
