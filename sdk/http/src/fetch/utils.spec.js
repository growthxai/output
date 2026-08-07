import { describe, expect, it } from 'vitest';
import { Headers, Request, Response } from 'undici';
import { requestIdSymbol } from '../consts.js';
import { addRequestIdToResponse, parseBody, redactHeaders } from './utils.js';

describe( 'instrumented_fetch/utils', () => {
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
