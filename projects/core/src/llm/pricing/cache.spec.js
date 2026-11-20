import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheFreshness } from '../consts.js';

const SNAPSHOT = {
  _meta: { createdAt: '2026-01-01T00:00:00.000Z' },
  openai: {
    models: {
      'gpt-snapshot': { cost: { input: 2, output: 10 }, reasoning: false }
    }
  }
};

const CACHE_TTL = 1000 * 60 * 60 * 24;

vi.mock( './models_pricing_snapshot.json', () => ( { default: SNAPSHOT } ) );

describe( 'pricing cache', () => {
  const cacheApi = {
    getPricing: () => {
      throw new Error( 'cache module not loaded' );
    },
    update: () => {
      throw new Error( 'cache module not loaded' );
    }
  };

  beforeEach( async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime( new Date( '2026-06-01T00:00:00.000Z' ) );
    Object.assign( cacheApi, await import( './cache.js' ) );
  } );

  afterEach( () => {
    vi.useRealTimers();
  } );

  it( 'returns the snapshot before any update', () => {
    const { models, freshness } = cacheApi.getPricing();

    expect( freshness ).toBe( CacheFreshness.SNAPSHOT );
    expect( models ).toBeInstanceOf( Map );
    expect( models.get( 'openai/gpt-snapshot' ) ).toEqual( {
      cost: { input: 2, output: 10 },
      reasoning: false
    } );
  } );

  it( 'returns cached content after update', () => {
    const content = new Map( [
      [ 'openai/live', { cost: { input: 1, output: 2 }, reasoning: true } ]
    ] );

    cacheApi.update( content );

    const { models, freshness } = cacheApi.getPricing();

    expect( freshness ).toBe( CacheFreshness.CACHED );
    expect( models ).toBe( content );
    expect( models.get( 'openai/live' ) ).toEqual( {
      cost: { input: 1, output: 2 },
      reasoning: true
    } );
  } );

  it( 'marks the cache stale once the ttl elapses', () => {
    const content = new Map( [
      [ 'openai/live', { cost: { input: 1, output: 2 }, reasoning: false } ]
    ] );

    cacheApi.update( content );
    vi.advanceTimersByTime( CACHE_TTL + 1 );

    const { models, freshness } = cacheApi.getPricing();

    expect( freshness ).toBe( CacheFreshness.STALE );
    expect( models ).toBe( content );
  } );

  it( 'refreshes expiry on a later update', () => {
    const first = new Map( [ [ 'openai/a', { cost: { input: 1, output: 1 }, reasoning: false } ] ] );
    const second = new Map( [ [ 'openai/b', { cost: { input: 2, output: 2 }, reasoning: true } ] ] );

    cacheApi.update( first );
    vi.advanceTimersByTime( CACHE_TTL - 1000 );
    cacheApi.update( second );
    vi.advanceTimersByTime( 2000 );

    const { models, freshness } = cacheApi.getPricing();

    expect( freshness ).toBe( CacheFreshness.CACHED );
    expect( models ).toBe( second );
  } );
} );
