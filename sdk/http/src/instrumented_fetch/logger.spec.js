import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Request, Response } from 'undici';

vi.mock( '@outputai/core/sdk/runtime', () => {
  class HTTPRequestCount {
    static TYPE = 'http:request:count';

    type = HTTPRequestCount.TYPE;

    constructor( url, requestId ) {
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

import { Tracing } from '@outputai/core/sdk/runtime';
import { config } from '../config.js';
import { logError, logFailure, logRequest, logResponse } from './logger.js';

const tracing = vi.mocked( Tracing, true );

beforeEach( () => {
  config.logVerbose = false;
  tracing.addEventStart.mockClear();
  tracing.addEventEnd.mockClear();
  tracing.addEventError.mockClear();
  tracing.addEventAttribute.mockClear();
} );

describe( 'instrumented_fetch/logger', () => {
  describe( 'logRequest', () => {
    it( 'records request details and the request count attribute', async () => {
      const request = new Request( 'https://example.com/users', { method: 'GET' } );

      await logRequest( { requestId: 'request-1', request } );

      expect( tracing.addEventStart ).toHaveBeenCalledWith( {
        id: 'request-1',
        kind: 'http',
        name: 'request',
        details: {
          method: 'GET',
          url: 'https://example.com/users'
        }
      } );
      expect( tracing.addEventAttribute ).toHaveBeenCalledWith( {
        eventId: 'request-1',
        attribute: expect.objectContaining( {
          type: 'http:request:count',
          url: 'https://example.com/users',
          requestId: 'request-1'
        } )
      } );
    } );

    it( 'includes redacted headers and parsed body in verbose mode', async () => {
      config.logVerbose = true;
      const request = new Request( 'https://example.com/users', {
        method: 'POST',
        headers: {
          authorization: 'secret',
          'content-type': 'application/json',
          'x-visible': 'visible'
        },
        body: JSON.stringify( { name: 'Ada' } )
      } );

      await logRequest( { requestId: 'request-verbose', request } );

      expect( tracing.addEventStart ).toHaveBeenCalledWith( {
        id: 'request-verbose',
        kind: 'http',
        name: 'request',
        details: {
          method: 'POST',
          url: 'https://example.com/users',
          headers: {
            authorization: '[REDACTED]',
            'content-type': 'application/json',
            'x-visible': 'visible'
          },
          body: { name: 'Ada' }
        }
      } );
    } );
  } );

  describe( 'logError', () => {
    it( 'records the response status, redacted headers, and body', async () => {
      const response = new Response( JSON.stringify( { error: 'unavailable' } ), {
        status: 503,
        statusText: 'Service Unavailable',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'secret'
        }
      } );

      await logError( { requestId: 'request-error', response } );

      expect( tracing.addEventError ).toHaveBeenCalledWith( {
        id: 'request-error',
        details: {
          status: 503,
          statusText: 'Service Unavailable',
          headers: {
            'content-type': 'application/json',
            'x-api-key': '[REDACTED]'
          },
          body: { error: 'unavailable' }
        }
      } );
    } );
  } );

  describe( 'logResponse', () => {
    it( 'omits headers and body outside verbose mode', async () => {
      const response = new Response( 'ok', {
        status: 200,
        statusText: 'OK',
        headers: { authorization: 'secret' }
      } );

      await logResponse( { requestId: 'request-response', response } );

      expect( tracing.addEventEnd ).toHaveBeenCalledWith( {
        id: 'request-response',
        details: {
          status: 200,
          statusText: 'OK'
        }
      } );
    } );

    it( 'includes redacted headers and parsed body in verbose mode', async () => {
      config.logVerbose = true;
      const response = new Response( JSON.stringify( { ok: true } ), {
        status: 201,
        statusText: 'Created',
        headers: {
          'content-type': 'application/json',
          'set-cookie': 'session=secret'
        }
      } );

      await logResponse( { requestId: 'request-response-verbose', response } );

      expect( tracing.addEventEnd ).toHaveBeenCalledWith( {
        id: 'request-response-verbose',
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
    it( 'records a serialized error', () => {
      const error = new TypeError( 'network unavailable' );

      logFailure( { requestId: 'request-failure', error } );

      expect( tracing.addEventError ).toHaveBeenCalledWith( {
        id: 'request-failure',
        details: {
          name: 'TypeError',
          message: 'network unavailable',
          stack: error.stack,
          code: undefined,
          cause: undefined
        }
      } );
    } );
  } );
} );
