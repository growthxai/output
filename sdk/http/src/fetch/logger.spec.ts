import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Response, Request } from 'undici';

vi.mock( '@outputai/core/sdk_activity_integration', () => {
  class HTTPRequestCount {
    static TYPE = 'http:request:count';
    type = HTTPRequestCount.TYPE;
    url: string;
    requestId: string;

    constructor( url: string, requestId: string ) {
      this.url = url;
      this.requestId = requestId;
    }
  }

  return {
    Tracing: {
      addEventStart: vi.fn(),
      addEventEnd: vi.fn(),
      addEventError: vi.fn(),
      addEventAttribute: vi.fn(),
      Attribute: {
        HTTPRequestCount
      }
    }
  };
} );

import { Tracing } from '@outputai/core/sdk_activity_integration';

const tracing = vi.mocked( Tracing, true );

/** Loads logger with optional verbose tracing env so `config.js` is evaluated fresh. */
async function logLogger( verbose: boolean ): Promise<typeof import( './logger.js' )> {
  vi.resetModules();
  if ( verbose ) {
    process.env.OUTPUT_TRACE_HTTP_VERBOSE = 'true';
  } else {
    delete process.env.OUTPUT_TRACE_HTTP_VERBOSE;
  }
  return import( './logger.js' );
}

beforeEach( () => {
  tracing.addEventStart.mockClear();
  tracing.addEventEnd.mockClear();
  tracing.addEventError.mockClear();
  tracing.addEventAttribute.mockClear();
} );

describe( 'fetch/logger', () => {
  describe( 'logRequest', () => {
    const expectRequestCountAttribute = ( requestId: string, url: string ) => {
      expect( tracing.addEventAttribute ).toHaveBeenCalledWith( {
        eventId: requestId,
        attribute: expect.objectContaining( {
          type: Tracing.Attribute.HTTPRequestCount.TYPE,
          url,
          requestId
        } )
      } );
    };

    it( 'records minimal details when verbose is off', async () => {
      const { logRequest } = await logLogger( false );
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
      expectRequestCountAttribute( 'req-1', 'https://api.example.com/r' );
    } );

    it( 'defaults method to GET', async () => {
      const { logRequest } = await logLogger( false );
      const request = new Request( 'https://x.test' );

      await logRequest( { requestId: 'r2', request } );

      expect( ( tracing.addEventStart.mock.calls[0][0].details as { method: string } ).method ).toBe( 'GET' );
      expectRequestCountAttribute( 'r2', 'https://x.test/' );
    } );

    it( 'includes redacted headers and parsed body when verbose is on', async () => {
      const { logRequest } = await logLogger( true );
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
      expectRequestCountAttribute( 'req-v', 'https://api.example.com/p' );
    } );
  } );

  describe( 'logError', () => {
    it( 'records status, statusText, redacted headers, and parsed JSON body', async () => {
      const { logError } = await logLogger( false );
      const body = { message: 'Upstream unavailable', code: 'E_UPSTREAM' };
      const response = new Response( JSON.stringify( body ), {
        status: 502,
        statusText: 'Bad Gateway',
        headers: {
          'X-API-Key': 'k',
          Accept: 'text/plain',
          'content-type': 'application/json'
        }
      } );

      await logError( { requestId: 'e1', response } );

      expect( tracing.addEventError ).toHaveBeenCalledWith( {
        id: 'e1',
        details: {
          status: 502,
          statusText: 'Bad Gateway',
          headers: {
            'x-api-key': '[REDACTED]',
            accept: 'text/plain',
            'content-type': 'application/json'
          },
          body
        }
      } );
    } );

    it( 'records error body as raw text when content-type is not application/json', async () => {
      const { logError } = await logLogger( false );
      const text = 'Bad Gateway: no healthy upstream';
      const response = new Response( text, {
        status: 502,
        statusText: 'Bad Gateway',
        headers: { 'content-type': 'text/plain' }
      } );

      await logError( { requestId: 'e2', response } );

      expect( tracing.addEventError ).toHaveBeenCalledWith( {
        id: 'e2',
        details: {
          status: 502,
          statusText: 'Bad Gateway',
          headers: { 'content-type': 'text/plain' },
          body: text
        }
      } );
    } );
  } );

  describe( 'logResponse', () => {
    it( 'records status and statusText without headers/body when verbose is off', async () => {
      const { logResponse } = await logLogger( false );
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
      const { logResponse } = await logLogger( true );
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
    it( 'forwards serialized error details (including stack) to Tracing.addEventError', async () => {
      const { logFailure } = await logLogger( false );
      const err = new TypeError( 'network' );

      logFailure( { requestId: 'f1', error: err } );

      expect( tracing.addEventError ).toHaveBeenCalledWith( {
        id: 'f1',
        details: {
          name: 'TypeError',
          message: 'network',
          cause: undefined,
          code: undefined,
          stack: expect.stringMatching( /TypeError:\s*network[\s\S]+at\s+/ )
        }
      } );
    } );
  } );
} );
