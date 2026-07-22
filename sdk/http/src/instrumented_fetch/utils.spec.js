import { describe, expect, it } from 'vitest';
import { Headers, Request, Response } from 'undici';
import { requestIdSymbol } from '../consts.js';
import { addRequestIdToResponse, parseBody, redactHeaders, serializeError } from './utils.js';

const createErrorChain = levels => {
  const root = new Error( 'level-1' );
  Array.from( { length: levels - 1 }, ( _, index ) => index + 2 ).reduce( ( current, level ) => {
    const cause = new Error( `level-${level}` );
    current.cause = cause;
    return cause;
  }, root );
  return root;
};

describe( 'instrumented_fetch/utils', () => {
  describe( 'serializeError', () => {
    it( 'serializes standard error properties and a nested cause', () => {
      const cause = new TypeError( 'cause' );
      const error = new Error( 'failure', { cause } );
      error.code = 'E_FAILURE';

      expect( serializeError( error ) ).toEqual( {
        name: 'Error',
        message: 'failure',
        stack: error.stack,
        code: 'E_FAILURE',
        cause: {
          name: 'TypeError',
          message: 'cause',
          stack: cause.stack,
          code: undefined,
          cause: undefined
        }
      } );
    } );

    it( 'limits the serialized cause depth', () => {
      const serialized = serializeError( createErrorChain( 7 ) );
      const current = Array.from( { length: 5 } ).reduce( cause => cause.cause, serialized );

      expect( current.message ).toBe( 'level-6' );
      expect( current.cause ).toBe( '<Max recursion depth reached>' );
    } );
  } );

  describe( 'redactHeaders', () => {
    it( 'redacts sensitive header names while preserving safe values', () => {
      const headers = new Headers( {
        authorization: 'Bearer secret',
        'x-api-key': 'secret',
        cookie: 'session=secret',
        'content-type': 'application/json'
      } );

      expect( redactHeaders( headers ) ).toEqual( {
        authorization: '[REDACTED]',
        'x-api-key': '[REDACTED]',
        cookie: '[REDACTED]',
        'content-type': 'application/json'
      } );
    } );

    it( 'does not redact exempt or substring-only header names', () => {
      const headers = new Headers( {
        'x-csrf-token': 'csrf-value',
        'public-key-pins': 'pin-value',
        keyboard: 'keyboard-value',
        tokens: 'token-count'
      } );

      expect( redactHeaders( headers ) ).toEqual( {
        'x-csrf-token': 'csrf-value',
        'public-key-pins': 'pin-value',
        keyboard: 'keyboard-value',
        tokens: 'token-count'
      } );
    } );
  } );

  describe( 'parseBody', () => {
    it( 'parses JSON bodies without consuming the original', async () => {
      const response = new Response( JSON.stringify( { ok: true } ), {
        headers: { 'content-type': 'application/json; charset=utf-8' }
      } );

      await expect( parseBody( response ) ).resolves.toEqual( { ok: true } );
      await expect( response.json() ).resolves.toEqual( { ok: true } );
    } );

    it( 'returns non-JSON and invalid JSON bodies as text', async () => {
      const textResponse = new Response( 'plain text', {
        headers: { 'content-type': 'text/plain' }
      } );
      const invalidJsonRequest = new Request( 'https://example.com', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{invalid'
      } );

      await expect( parseBody( textResponse ) ).resolves.toBe( 'plain text' );
      await expect( parseBody( invalidJsonRequest ) ).resolves.toBe( '{invalid' );
    } );

    it( 'returns an empty string for an empty JSON body', async () => {
      const response = new Response( '', {
        headers: { 'content-type': 'application/json' }
      } );

      await expect( parseBody( response ) ).resolves.toBe( '' );
    } );
  } );

  describe( 'addRequestIdToResponse', () => {
    it( 'stores an immutable, non-enumerable request id', () => {
      const response = new Response( 'ok' );

      addRequestIdToResponse( response, 'request-1' );

      expect( response[requestIdSymbol] ).toBe( 'request-1' );
      expect( Object.getOwnPropertyDescriptor( response, requestIdSymbol ) ).toEqual( {
        value: 'request-1',
        enumerable: false,
        configurable: false,
        writable: false
      } );
    } );

    it( 'propagates the request id through repeated clones', () => {
      const response = new Response( 'ok' );
      addRequestIdToResponse( response, 'request-clone' );

      const clone = response.clone();
      const grandchild = clone.clone();

      expect( clone[requestIdSymbol] ).toBe( 'request-clone' );
      expect( grandchild[requestIdSymbol] ).toBe( 'request-clone' );
    } );
  } );
} );
