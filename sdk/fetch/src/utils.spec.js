import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock( '@outputai/core/sdk_activity_integration', () => ( {
  Tracing: {
    addEventStart: vi.fn(),
    addEventEnd: vi.fn(),
    addEventError: vi.fn()
  }
} ) );

import { Tracing } from '@outputai/core/sdk_activity_integration';

const tracing = vi.mocked( Tracing, true );

/**
 * Loads utils with optional verbose tracing env so `config.js` is evaluated fresh.
 *
 * @param {boolean} verbose
 * @returns {Promise<typeof import('./utils.js')>}
 */
async function loadUtils( verbose ) {
  vi.resetModules();
  if ( verbose ) {
    process.env.OUTPUT_TRACE_HTTP_VERBOSE = 'true';
  } else {
    delete process.env.OUTPUT_TRACE_HTTP_VERBOSE;
  }
  return import( './utils.js' );
}

beforeEach( () => {
  tracing.addEventStart.mockClear();
  tracing.addEventEnd.mockClear();
  tracing.addEventError.mockClear();
} );

describe( 'fetch/utils', () => {
  describe( 'redactHeaders', () => {
    it( 'redacts sensitive headers case-insensitively', async () => {
      const { redactHeaders } = await loadUtils( false );
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

    it( 'leaves non-sensitive headers unchanged', async () => {
      const { redactHeaders } = await loadUtils( false );
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

    it( 'handles empty Headers', async () => {
      const { redactHeaders } = await loadUtils( false );
      expect( redactHeaders( new Headers() ) ).toEqual( {} );
    } );

    it( 'redacts sensitive keys even when values are empty', async () => {
      const { redactHeaders } = await loadUtils( false );
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

    it( 'matches substrings in header names (e.g. Keyboard, Secretary, Tokens)', async () => {
      const { redactHeaders } = await loadUtils( false );
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
      const { parseBody } = await loadUtils( false );
      const response = new Response( JSON.stringify( { ok: true } ), {
        headers: { 'content-type': 'application/json' }
      } );
      await expect( parseBody( response ) ).resolves.toEqual( { ok: true } );
    } );

    it( 'parses JSON when content-type includes charset', async () => {
      const { parseBody } = await loadUtils( false );
      const response = new Response( JSON.stringify( [ 1, 2 ] ), {
        headers: { 'content-type': 'application/json; charset=utf-8' }
      } );
      await expect( parseBody( response ) ).resolves.toEqual( [ 1, 2 ] );
    } );

    it( 'returns text when content-type is not JSON', async () => {
      const { parseBody } = await loadUtils( false );
      const response = new Response( 'hello', {
        headers: { 'content-type': 'text/plain' }
      } );
      await expect( parseBody( response ) ).resolves.toBe( 'hello' );
    } );

    it( 'uses text branch when content-type is missing', async () => {
      const { parseBody } = await loadUtils( false );
      const response = new Response( 'plain' );
      await expect( parseBody( response ) ).resolves.toBe( 'plain' );
    } );

    it( 'returns empty string for empty body (text)', async () => {
      const { parseBody } = await loadUtils( false );
      const response = new Response( '', { headers: { 'content-type': 'text/plain' } } );
      await expect( parseBody( response ) ).resolves.toBe( '' );
    } );

    it( 'rejects when JSON branch is used with an empty body', async () => {
      const { parseBody } = await loadUtils( false );
      const response = new Response( '', { headers: { 'content-type': 'application/json' } } );
      await expect( parseBody( response ) ).rejects.toThrow( SyntaxError );
    } );

    it( 'does not consume the original body (clone)', async () => {
      const { parseBody } = await loadUtils( false );
      const response = new Response( 'read-me', { headers: { 'content-type': 'text/plain' } } );
      await parseBody( response );
      await expect( response.text() ).resolves.toBe( 'read-me' );
    } );

    it( 'parses JSON Request body', async () => {
      const { parseBody } = await loadUtils( false );
      const request = new Request( 'https://ex.com', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify( { a: 1 } )
      } );
      await expect( parseBody( request ) ).resolves.toEqual( { a: 1 } );
    } );
  } );

  describe( 'logRequest', () => {
    it( 'records minimal details when verbose is off', async () => {
      const { logRequest } = await loadUtils( false );
      const request = new Request( 'https://api.example.com/r', { method: 'GET' } );

      await logRequest( { requestId: 'req-1', request } );

      expect( tracing.addEventStart ).toHaveBeenCalledWith( {
        id: 'req-1',
        kind: 'http',
        name: 'request',
        details: {
          method: 'GET',
          url: 'https://api.example.com/r'
        }
      } );
    } );

    it( 'defaults method to GET', async () => {
      const { logRequest } = await loadUtils( false );
      const request = new Request( 'https://x.test' );

      await logRequest( { requestId: 'r2', request } );

      expect( tracing.addEventStart.mock.calls[0][0].details.method ).toBe( 'GET' );
    } );

    it( 'includes redacted headers and parsed body when verbose is on', async () => {
      const { logRequest } = await loadUtils( true );
      const request = new Request( 'https://api.example.com/p', {
        method: 'POST',
        headers: {
          authorization: 'tok',
          'X-Custom': 'ok',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify( { x: 1 } )
      } );

      await logRequest( { requestId: 'req-v', request } );

      expect( tracing.addEventStart ).toHaveBeenCalledWith( {
        id: 'req-v',
        kind: 'http',
        name: 'request',
        details: {
          method: 'POST',
          url: 'https://api.example.com/p',
          headers: { authorization: '[REDACTED]', 'x-custom': 'ok', 'content-type': 'application/json' },
          body: { x: 1 }
        }
      } );
    } );
  } );

  describe( 'logError', () => {
    it( 'records status, statusText, and redacted headers', async () => {
      const { logError } = await loadUtils( false );
      const response = new Response( null, {
        status: 502,
        statusText: 'Bad Gateway',
        headers: { 'X-API-Key': 'k', Accept: 'text/plain' }
      } );

      logError( { requestId: 'e1', response } );

      expect( tracing.addEventError ).toHaveBeenCalledWith( {
        id: 'e1',
        details: {
          status: 502,
          statusText: 'Bad Gateway',
          headers: {
            'x-api-key': '[REDACTED]',
            accept: 'text/plain'
          }
        }
      } );
    } );
  } );

  describe( 'logResponse', () => {
    it( 'records status and statusText without headers/body when verbose is off', async () => {
      const { logResponse } = await loadUtils( false );
      const response = new Response( JSON.stringify( { a: 1 } ), {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json', Authorization: 'x' }
      } );

      await logResponse( { requestId: 'lr1', response } );

      expect( tracing.addEventEnd ).toHaveBeenCalledWith( {
        id: 'lr1',
        details: {
          status: 200,
          statusText: 'OK'
        }
      } );
    } );

    it( 'includes redacted headers and parsed body when verbose is on', async () => {
      const { logResponse } = await loadUtils( true );
      const response = new Response( JSON.stringify( { ok: true } ), {
        status: 201,
        statusText: 'Created',
        headers: {
          'content-type': 'application/json',
          'Set-Cookie': 'a=b'
        }
      } );

      await logResponse( { requestId: 'lr-v', response } );

      expect( tracing.addEventEnd ).toHaveBeenCalledWith( {
        id: 'lr-v',
        details: {
          status: 201,
          statusText: 'Created',
          headers: {
            'content-type': 'application/json',
            'set-cookie': '[REDACTED]'
          },
          body: { ok: true }
        }
      } );
    } );
  } );

  describe( 'logFailure', () => {
    it( 'forwards error details to Tracing.addEventError', async () => {
      const { logFailure } = await loadUtils( false );
      const err = new TypeError( 'network' );

      logFailure( { requestId: 'f1', error: err } );

      expect( tracing.addEventError ).toHaveBeenCalledWith( { id: 'f1', details: err } );
    } );
  } );
} );
