import { describe, it, expect, vi } from 'vitest';
import type { Input } from 'ky';
import { httpClient } from './index.js';

describe( 'httpClient', () => {
  it( 'passes the injected fetch to ky so requests use the custom implementation', async () => {
    const spyFetch = vi.fn(
      ( _input: Input, _init?: RequestInit ) =>
        Promise.resolve( new Response( JSON.stringify( { ok: true } ), { status: 200 } ) )
    );

    const client = httpClient( {
      fetch: spyFetch,
      prefixUrl: 'https://example.com'
    } );

    await client.get( 'path' );

    expect( spyFetch ).toHaveBeenCalled();
  } );
} );
