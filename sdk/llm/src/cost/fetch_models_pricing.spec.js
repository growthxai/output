import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { fetchModelsPricing, cache } from './fetch_models_pricing.js';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const fixturePath = join( __dirname, 'fixtures', 'models_api_light.json' );
const fixture = JSON.parse( readFileSync( fixturePath, 'utf8' ) );

const costTableUrl = 'https://models.dev/api.json';
const errNoCache = status => `Error ${status} when fetching models pricing at ${costTableUrl}`;
const warnStaleCache = status => `Error ${status} when fetching models pricing at ${costTableUrl}, falling back to stale cache`;

describe( 'fetchModelsPricing', () => {
  beforeEach( () => {
    cache.content = null;
    cache.expiresAt = 0;
    vi.restoreAllMocks();
  } );

  it( 'returns a Map of model costs when fetch succeeds', async () => {
    vi.stubGlobal( 'fetch', vi.fn().mockResolvedValue( {
      ok: true,
      json: () => Promise.resolve( fixture )
    } ) );

    const result = await fetchModelsPricing();

    expect( result ).toBeInstanceOf( Map );
    expect( result.size ).toBeGreaterThan( 0 );
    const firstModel = Object.values( fixture )[0];
    const firstModelId = Object.keys( firstModel.models )[0];
    const cost = firstModel.models[firstModelId].cost;
    expect( result.get( firstModelId ) ).toEqual( cost );
    expect( result.get( `${firstModel.id}/${firstModelId}` ) ).toEqual( cost );
  } );

  it( 'includes main providers from fixture (openai, anthropic, google, nvidia, perplexity)', async () => {
    vi.stubGlobal( 'fetch', vi.fn().mockResolvedValue( {
      ok: true,
      json: () => Promise.resolve( fixture )
    } ) );

    const result = await fetchModelsPricing();

    const openaiProvider = fixture.openai;
    const openaiModelId = Object.keys( openaiProvider.models )[0];
    expect( result.get( openaiModelId ) ).toBeDefined();
    expect( result.get( `openai/${openaiModelId}` ) ).toEqual( openaiProvider.models[openaiModelId].cost );

    const anthropicModelId = Object.keys( fixture.anthropic.models )[0];
    expect( result.get( anthropicModelId ) ).toBeDefined();
  } );

  it( 'returns null when response is not ok and no cache', async () => {
    const status = 500;
    const err = vi.spyOn( console, 'error' ).mockImplementation( () => {} );
    vi.stubGlobal( 'fetch', vi.fn().mockResolvedValue( { ok: false, status } ) );

    const result = await fetchModelsPricing();

    expect( result ).toBeNull();
    expect( err ).toHaveBeenCalledWith( errNoCache( status ) );
    err.mockRestore();
  } );

  it( 'returns stale cache when response is not ok but cache exists', async () => {
    vi.stubGlobal( 'fetch', vi.fn().mockResolvedValue( {
      ok: true,
      json: () => Promise.resolve( fixture )
    } ) );
    await fetchModelsPricing();
    cache.expiresAt = 0; // force refetch so we hit the !res.ok path

    const status = 404;
    const warn = vi.spyOn( console, 'warn' ).mockImplementation( () => {} );
    vi.stubGlobal( 'fetch', vi.fn().mockResolvedValue( { ok: false, status } ) );

    const result = await fetchModelsPricing();

    expect( result ).toBeInstanceOf( Map );
    expect( result.size ).toBeGreaterThan( 0 );
    expect( warn ).toHaveBeenCalledWith( warnStaleCache( status ) );
    warn.mockRestore();
  } );

  it( 'returns cached Map when cache is still valid', async () => {
    vi.stubGlobal( 'fetch', vi.fn().mockResolvedValue( {
      ok: true,
      json: () => Promise.resolve( fixture )
    } ) );

    const first = await fetchModelsPricing();
    const second = await fetchModelsPricing();

    expect( first ).toBe( second );
    expect( fetch ).toHaveBeenCalledTimes( 1 );
  } );

  it( 'only stores models that have a cost object', async () => {
    const dataWithMissingCost = {
      p1: {
        id: 'p1',
        models: {
          withCost: { cost: { input: 1, output: 2 } },
          noCost: { name: 'x' }
        }
      }
    };
    vi.stubGlobal( 'fetch', vi.fn().mockResolvedValue( {
      ok: true,
      json: () => Promise.resolve( dataWithMissingCost )
    } ) );

    const result = await fetchModelsPricing();

    expect( result.get( 'withCost' ) ).toEqual( { input: 1, output: 2 } );
    expect( result.get( 'noCost' ) ).toBeUndefined();
  } );
} );
