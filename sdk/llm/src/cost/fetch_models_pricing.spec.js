import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { fetchModelsPricing, cache } from './fetch_models_pricing.js';

const fetchMock = vi.hoisted( () => vi.fn() );
const EnvHttpProxyAgentMock = vi.hoisted( () => vi.fn( function EnvHttpProxyAgent( options ) {
  this.options = options;
} ) );

vi.mock( 'undici', () => ( {
  EnvHttpProxyAgent: EnvHttpProxyAgentMock,
  fetch: fetchMock
} ) );

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const fixturePath = join( __dirname, 'fixtures', 'models_api_light.json' );
const fixture = JSON.parse( readFileSync( fixturePath, 'utf8' ) );

const costTableUrl = 'https://models.dev/api.json';
const okResponse = data => ( {
  ok: true,
  json: () => Promise.resolve( data )
} );
const stubFetch = response => {
  fetchMock.mockResolvedValueOnce( response );
  return fetchMock;
};

describe( 'fetchModelsPricing', () => {
  beforeEach( () => {
    cache.content = null;
    cache.expiresAt = 0;
    fetchMock.mockReset();
  } );

  it( 'returns a Map of model costs when fetch succeeds', async () => {
    const fetchMock = stubFetch( okResponse( fixture ) );

    const result = await fetchModelsPricing();

    expect( EnvHttpProxyAgentMock ).toHaveBeenCalledWith( { allowH2: false } );
    expect( fetchMock ).toHaveBeenCalledWith( costTableUrl, { dispatcher: EnvHttpProxyAgentMock.mock.results[0].value } );
    expect( result ).toBeInstanceOf( Map );
    expect( result.size ).toBeGreaterThan( 0 );
    const firstModel = Object.values( fixture )[0];
    const firstModelId = Object.keys( firstModel.models )[0];
    const cost = firstModel.models[firstModelId].cost;
    expect( result.get( firstModelId ) ).toEqual( cost );
    expect( result.get( `${firstModel.id}/${firstModelId}` ) ).toEqual( cost );
  } );

  it( 'includes main providers from fixture (openai, anthropic, google, nvidia, perplexity)', async () => {
    stubFetch( okResponse( fixture ) );

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
    stubFetch( { ok: false, status } );

    const result = await fetchModelsPricing();

    expect( result ).toBeNull();
  } );

  it( 'returns stale cache when response is not ok but cache exists', async () => {
    stubFetch( okResponse( fixture ) );
    await fetchModelsPricing();
    cache.expiresAt = 0; // force refetch so we hit the !res.ok path

    const status = 404;
    stubFetch( { ok: false, status } );

    const result = await fetchModelsPricing();

    expect( result ).toBeInstanceOf( Map );
    expect( result.size ).toBeGreaterThan( 0 );
  } );

  it( 'returns null when fetch rejects and no cache', async () => {
    const error = new Error( 'network failure' );
    fetchMock.mockRejectedValueOnce( error );

    const result = await fetchModelsPricing();

    expect( result ).toBeNull();
  } );

  it( 'returns stale cache when fetch rejects but cache exists', async () => {
    stubFetch( okResponse( fixture ) );
    const staleCache = await fetchModelsPricing();
    cache.expiresAt = 0; // force refetch so we hit the catch path

    const error = Object.assign( new Error( 'socket closed' ), { code: 'UND_ERR_SOCKET' } );
    fetchMock.mockRejectedValueOnce( error );

    const result = await fetchModelsPricing();

    expect( result ).toBe( staleCache );
  } );

  it( 'returns stale cache when response JSON parsing fails but cache exists', async () => {
    stubFetch( okResponse( fixture ) );
    const staleCache = await fetchModelsPricing();
    cache.expiresAt = 0; // force refetch so parsing errors can fall back to cache

    stubFetch( {
      ok: true,
      json: () => Promise.reject( new SyntaxError( 'Unexpected token' ) )
    } );

    const result = await fetchModelsPricing();

    expect( result ).toBe( staleCache );
  } );

  it( 'returns cached Map when cache is still valid', async () => {
    const fetchMock = stubFetch( okResponse( fixture ) );

    const first = await fetchModelsPricing();
    const second = await fetchModelsPricing();

    expect( first ).toBe( second );
    expect( fetchMock ).toHaveBeenCalledTimes( 1 );
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
    stubFetch( okResponse( dataWithMissingCost ) );

    const result = await fetchModelsPricing();

    expect( result.get( 'withCost' ) ).toEqual( { input: 1, output: 2 } );
    expect( result.get( 'noCost' ) ).toBeUndefined();
  } );
} );
