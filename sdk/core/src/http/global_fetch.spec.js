import { describe, expect, it } from 'vitest';
import { undici } from './index.js';

describe( 'global fetch compatibility', () => {
  it( 'decodes gzip after Undici is imported', async () => {
    expect( undici.fetch ).toBeTypeOf( 'function' );

    const response = await globalThis.fetch( 'https://httpbin.io/gzip' );

    expect( response.headers.get( 'content-encoding' ) ).toBe( 'gzip' );
    await expect( response.json() ).resolves.toMatchObject( { gzipped: true } );
  } );
} );
