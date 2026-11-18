import { describe, expect, it } from 'vitest';
import { createBoundedCache } from './bounded_cache.js';

describe( 'createBoundedCache', () => {
  it( 'round-trips set and get', () => {
    const cache = createBoundedCache<string, number>( 3 );
    cache.set( 'a', 1 );
    expect( cache.get( 'a' ) ).toBe( 1 );
    expect( cache.get( 'missing' ) ).toBeUndefined();
  } );

  it( 'evicts the oldest entry once maxSize is exceeded', () => {
    const cache = createBoundedCache<string, number>( 2 );
    cache.set( 'a', 1 );
    cache.set( 'b', 2 );
    cache.set( 'c', 3 );
    expect( cache.has( 'a' ) ).toBe( false );
    expect( cache.get( 'b' ) ).toBe( 2 );
    expect( cache.get( 'c' ) ).toBe( 3 );
  } );

  it( 'refreshes recency on get so the touched entry survives eviction', () => {
    const cache = createBoundedCache<string, number>( 2 );
    cache.set( 'a', 1 );
    cache.set( 'b', 2 );
    // Touch 'a' so 'b' becomes the least-recently-used entry.
    expect( cache.get( 'a' ) ).toBe( 1 );
    cache.set( 'c', 3 );
    expect( cache.has( 'a' ) ).toBe( true );
    expect( cache.has( 'b' ) ).toBe( false );
    expect( cache.has( 'c' ) ).toBe( true );
  } );

  it( 'updates an existing key in place without growing', () => {
    const cache = createBoundedCache<string, number>( 2 );
    cache.set( 'a', 1 );
    cache.set( 'a', 2 );
    expect( cache.get( 'a' ) ).toBe( 2 );
    expect( cache.size() ).toBe( 1 );
  } );

  it( 'supports has and clear', () => {
    const cache = createBoundedCache<string, number>( 2 );
    cache.set( 'a', 1 );
    expect( cache.has( 'a' ) ).toBe( true );
    cache.clear();
    expect( cache.has( 'a' ) ).toBe( false );
    expect( cache.size() ).toBe( 0 );
  } );

  it( 'never exceeds maxSize', () => {
    const cache = createBoundedCache<string, number>( 3 );
    Array.from( { length: 100 }, ( _, i ) => i ).forEach( i => {
      cache.set( `key-${i}`, i );
      expect( cache.size() ).toBeLessThanOrEqual( 3 );
    } );
    expect( cache.size() ).toBe( 3 );
  } );
} );
