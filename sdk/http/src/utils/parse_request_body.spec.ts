import { describe, it, expect } from 'vitest';
import type { KyRequest } from 'ky';
import parseRequestBody from './parse_request_body.js';

describe( 'utils/parse_request_body', () => {
  it( 'returns null when no body is present', async () => {
    const req = new Request( 'https://ex.com', { method: 'GET' } ) as KyRequest;
    const result = await parseRequestBody( req );
    expect( result ).toBeNull();
  } );

  it( 'parses JSON body when present', async () => {
    const req = new Request( 'https://ex.com', { method: 'POST', body: JSON.stringify( { a: 1 } ) } ) as KyRequest;
    const result = await parseRequestBody( req );
    expect( result ).toEqual( { a: 1 } );
  } );

  it( 'returns raw text when not valid JSON', async () => {
    const req = new Request( 'https://ex.com', { method: 'POST', body: 'not-json' } ) as KyRequest;
    const result = await parseRequestBody( req );
    expect( result ).toBe( 'not-json' );
  } );
} );
