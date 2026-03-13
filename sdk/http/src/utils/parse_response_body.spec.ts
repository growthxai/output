import { describe, it, expect } from 'vitest';
import type { KyResponse } from 'ky';
import parseResponseBody from './parse_response_body.js';

describe( 'utils/parse_response_body', () => {
  it( 'parses JSON when content-type is application/json', async () => {
    const res = new Response( JSON.stringify( { ok: true } ), { headers: { 'content-type': 'application/json' } } ) as KyResponse;
    const result = await parseResponseBody( res );
    expect( result ).toEqual( { ok: true } );
  } );

  it( 'returns text when content-type is not JSON', async () => {
    const res = new Response( 'hello', { headers: { 'content-type': 'text/plain' } } ) as KyResponse;
    const result = await parseResponseBody( res );
    expect( result ).toBe( 'hello' );
  } );

  it( 'returns null for empty body', async () => {
    const res = new Response( '', { headers: { 'content-type': 'text/plain' } } ) as KyResponse;
    const result = await parseResponseBody( res );
    expect( result ).toBeNull();
  } );
} );
