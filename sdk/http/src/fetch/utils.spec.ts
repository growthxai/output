import { describe, it, expect } from 'vitest';
import { Response, Request, Headers } from 'undici';
import { parseBody, redactHeaders, serializeError } from './utils.js';

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

    it( 'uses max-depth sentinel for cause when depth is greater than 5', () => {
      const err = new Error( 'x' );

      expect( serializeError( err, 6 ).cause ).toBe( '<Max recursion depth reached>' );
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

    it( 'matches substrings in header names (e.g. Keyboard, Secretary, Tokens)', () => {
      const headers = new Headers( {
        Keyboard: 'qwerty',
        Secretary: 'admin',
        Tokens: 'abc123',
        'Content-Length': '123'
      } );
      expect( redactHeaders( headers ) ).toEqual( {
        keyboard: '[REDACTED]',
        secretary: '[REDACTED]',
        tokens: '[REDACTED]',
        'content-length': '123'
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

    it( 'rejects when JSON branch is used with an empty body', async () => {
      const response = new Response( '', { headers: { 'content-type': 'application/json' } } );
      await expect( parseBody( response ) ).rejects.toThrow( SyntaxError );
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
  } );
} );
