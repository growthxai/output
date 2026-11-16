import { describe, it, expect } from 'vitest';
import { formatBytes } from '#utils/size_formatter.js';

describe( 'formatBytes', () => {
  it( 'formats zero and small values in bytes', () => {
    expect( formatBytes( 0 ) ).toBe( '0 B' );
    expect( formatBytes( 512 ) ).toBe( '512 B' );
  } );

  it( 'uses 1024-based units', () => {
    expect( formatBytes( 1024 ) ).toBe( '1 KB' );
    expect( formatBytes( 1024 * 1024 ) ).toBe( '1 MB' );
    expect( formatBytes( 256 * 1024 * 1024 ) ).toBe( '256 MB' );
    expect( formatBytes( 1024 ** 3 ) ).toBe( '1 GB' );
  } );

  it( 'keeps one decimal at most and drops a trailing zero', () => {
    expect( formatBytes( 1536 ) ).toBe( '1.5 KB' );
    expect( formatBytes( 587158372 ) ).toBe( '560 MB' );
  } );

  it( 'caps the unit at GB', () => {
    expect( formatBytes( 2048 * ( 1024 ** 3 ) ) ).toBe( '2048 GB' );
  } );
} );
