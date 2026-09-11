import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchModelsPricing, cache, state, Freshness } from './models_pricing.js';
import fixture from '../fixtures/models_api_light.json' with { type: 'json' };

const fetchMock = vi.hoisted( () => vi.fn() );
const EnvHttpProxyAgentMock = vi.hoisted( () => vi.fn( function EnvHttpProxyAgent( options ) {
  this.options = options;
} ) );
/* Stands in for the shipped snapshot: this suite covers fetch, cache and cooldown behaviour, not the catalog contents. */
const fallbackJson = vi.hoisted( () => ( {
  _meta: { createdAt: '2026-01-01T00:00:00.000Z' },
  anthropic: {
    models: {
      'claude-sonnet-4-6': { cost: { input: 3, output: 15 } }
    }
  },
  openai: {
    models: {
      'gpt-4o-2024-11-20': { cost: { input: 2.5, output: 10, cache_read: 1.25 } },
      'text-embedding-3-small': {} // unpriced models are dropped
    }
  }
} ) );

vi.mock( 'undici', () => ( {
  EnvHttpProxyAgent: EnvHttpProxyAgentMock,
  fetch: fetchMock
} ) );
vi.mock( './models_pricing_snapshot.json', () => ( { default: fallbackJson } ) );

const costTableUrl = 'https://models.dev/api.json';
const cooldownTTL = 1000 * 60 * 10; // mirrors models_pricing.js
const okResponse = data => ( {
  ok: true,
  json: () => Promise.resolve( data )
} );
const stubFetch = response => {
  fetchMock.mockResolvedValueOnce( response );
  return fetchMock;
};
/* Most cases only care about the parsed table; freshness has dedicated assertions below. */
const fetchModels = async () => ( await fetchModelsPricing() ).models;
const fallbackProviders = Object.entries( fallbackJson ).filter( ( [ key ] ) => key !== '_meta' );
const fallbackEntries = fallbackProviders
  .flatMap( ( [ , provider ] ) => Object.values( provider.models ) )
  .filter( model => model.cost );

/* A models.dev entry as served by the API: the stripped fallback keeps only the `cost` branch of this shape. */
const fullTable = ( providerId, modelId, cost ) => ( {
  [providerId]: {
    id: providerId,
    env: [ 'OPENAI_API_KEY' ],
    npm: '@ai-sdk/openai',
    name: 'OpenAI',
    doc: 'https://platform.openai.com/docs/models',
    models: {
      [modelId]: {
        id: modelId,
        name: 'GPT-4o',
        description: 'Multimodal flagship model',
        family: 'gpt-4o',
        attachment: true,
        reasoning: false,
        tool_call: true,
        structured_output: true,
        temperature: true,
        knowledge: '2023-10',
        release_date: '2024-11-20',
        last_updated: '2024-11-20',
        modalities: { input: [ 'text', 'image' ], output: [ 'text' ] },
        open_weights: false,
        limit: { context: 128000, output: 16384 },
        cost
      }
    }
  }
} );

describe( 'modelsPricing', () => {
  beforeEach( () => {
    cache.content = null;
    cache.expiresAt = 0;
    state.ignoreLiveRequestsUntil = 0;
    fetchMock.mockReset();
  } );

  it( 'returns a Map of model costs when fetch succeeds', async () => {
    const fetchMock = stubFetch( okResponse( fixture ) );

    const { models: result, freshness } = await fetchModelsPricing();

    expect( EnvHttpProxyAgentMock ).toHaveBeenCalledWith( { allowH2: false } );
    expect( fetchMock ).toHaveBeenCalledWith( costTableUrl, { dispatcher: EnvHttpProxyAgentMock.mock.results[0].value } );
    expect( result ).toBeInstanceOf( Map );
    expect( result.size ).toBeGreaterThan( 0 );
    expect( freshness ).toBe( Freshness.LIVE );
    const firstModel = Object.values( fixture )[0];
    const firstModelId = Object.keys( firstModel.models )[0];
    const cost = firstModel.models[firstModelId].cost;
    expect( result.get( firstModelId ) ).toBeUndefined();
    expect( result.get( `${firstModel.id}/${firstModelId}` ) ).toEqual( cost );
  } );

  it( 'includes main providers from fixture (openai, anthropic, google, nvidia, perplexity)', async () => {
    stubFetch( okResponse( fixture ) );

    const result = await fetchModels();

    const openaiProvider = fixture.openai;
    const openaiModelId = Object.keys( openaiProvider.models )[0];
    expect( result.get( openaiModelId ) ).toBeUndefined();
    expect( result.get( `openai/${openaiModelId}` ) ).toEqual( openaiProvider.models[openaiModelId].cost );

    const anthropicModelId = Object.keys( fixture.anthropic.models )[0];
    expect( result.get( `anthropic/${anthropicModelId}` ) ).toEqual( fixture.anthropic.models[anthropicModelId].cost );
  } );

  it( 'keeps separate costs when the same model id exists under two providers', async () => {
    stubFetch( okResponse( fixture ) );

    const result = await fetchModels();
    const sharedModelId = 'gpt-4o-2024-11-20';

    expect( result.get( sharedModelId ) ).toBeUndefined();
    expect( result.get( `openai/${sharedModelId}` ) ).toEqual( fixture.openai.models[sharedModelId].cost );
    expect( result.get( `azure/${sharedModelId}` ) ).toEqual( fixture.azure.models[sharedModelId].cost );
    expect( result.get( `openai/${sharedModelId}` ) ).not.toEqual( result.get( `azure/${sharedModelId}` ) );
  } );

  it( 'returns the bundled fallback table when response is not ok and no cache', async () => {
    const status = 500;
    stubFetch( { ok: false, status } );

    const { models: result, freshness } = await fetchModelsPricing();

    expect( result ).toBeInstanceOf( Map );
    expect( result.size ).toBe( fallbackEntries.length );
    expect( freshness ).toBe( Freshness.SNAPSHOT );
  } );

  it( 'returns stale cache when response is not ok but cache exists', async () => {
    stubFetch( okResponse( fixture ) );
    await fetchModelsPricing();
    cache.expiresAt = 0; // force refetch so we hit the !res.ok path

    const status = 404;
    stubFetch( { ok: false, status } );

    const { models: result, freshness } = await fetchModelsPricing();

    expect( result ).toBeInstanceOf( Map );
    expect( result.size ).toBeGreaterThan( 0 );
    expect( freshness ).toBe( Freshness.STALE );
  } );

  it( 'returns the bundled fallback table when fetch rejects and no cache', async () => {
    const error = new Error( 'network failure' );
    fetchMock.mockRejectedValueOnce( error );

    const { models: result, freshness } = await fetchModelsPricing();

    expect( result ).toBeInstanceOf( Map );
    expect( result.size ).toBe( fallbackEntries.length );
    expect( freshness ).toBe( Freshness.SNAPSHOT );
    expect( result.get( 'openai/gpt-4o-2024-11-20' ) ).toEqual( fallbackJson.openai.models['gpt-4o-2024-11-20'].cost );
    expect( result.get( 'gpt-4o-2024-11-20' ) ).toBeUndefined();
  } );

  it( 'maps the stripped fallback entry to the same cost as the full models.dev table', async () => {
    const providerId = 'openai';
    const modelId = 'gpt-4o-2024-11-20';
    const { cost } = fallbackJson[providerId].models[modelId];
    stubFetch( okResponse( fullTable( providerId, modelId, cost ) ) );

    const remote = await fetchModels();

    cache.content = null;
    cache.expiresAt = 0;
    fetchMock.mockRejectedValueOnce( new Error( 'network failure' ) );
    const fallback = await fetchModels();

    expect( remote.get( `${providerId}/${modelId}` ) ).toEqual( fallback.get( `${providerId}/${modelId}` ) );
    expect( fallback.get( `${providerId}/${modelId}` ) ).toEqual( { input: 2.5, output: 10, cache_read: 1.25 } );
  } );

  it( 'covers every provider in the fallback table', async () => {
    fetchMock.mockRejectedValueOnce( new Error( 'network failure' ) );

    const result = await fetchModels();

    for ( const [ providerId, provider ] of fallbackProviders ) {
      const modelId = Object.keys( provider.models )[0];
      expect( result.get( `${providerId}/${modelId}` ) ).toEqual( provider.models[modelId].cost );
    }
    expect( [ ...result.keys() ].some( key => key.startsWith( '_meta' ) ) ).toBe( false );
  } );

  it( 'returns stale cache when fetch rejects but cache exists', async () => {
    stubFetch( okResponse( fixture ) );
    const staleCache = await fetchModels();
    cache.expiresAt = 0; // force refetch so we hit the catch path

    const error = Object.assign( new Error( 'socket closed' ), { code: 'UND_ERR_SOCKET' } );
    fetchMock.mockRejectedValueOnce( error );

    const { models: result, freshness } = await fetchModelsPricing();

    expect( result ).toBe( staleCache );
    expect( freshness ).toBe( Freshness.STALE );
  } );

  it( 'returns stale cache when response JSON parsing fails but cache exists', async () => {
    stubFetch( okResponse( fixture ) );
    const staleCache = await fetchModels();
    cache.expiresAt = 0; // force refetch so parsing errors can fall back to cache

    stubFetch( {
      ok: true,
      json: () => Promise.reject( new SyntaxError( 'Unexpected token' ) )
    } );

    const { models: result, freshness } = await fetchModelsPricing();

    expect( result ).toBe( staleCache );
    expect( freshness ).toBe( Freshness.STALE );
  } );

  it( 'skips the live request while the cooldown is open', async () => {
    fetchMock.mockRejectedValueOnce( new Error( 'network failure' ) );
    const first = await fetchModelsPricing();

    const second = await fetchModelsPricing();

    expect( fetchMock ).toHaveBeenCalledTimes( 1 );
    expect( second.models ).toBe( first.models );
    expect( second.freshness ).toBe( Freshness.SNAPSHOT );
    expect( state.ignoreLiveRequestsUntil ).toBeGreaterThan( Date.now() );
  } );

  it( 'keeps serving the stale cache without refetching while the cooldown is open', async () => {
    stubFetch( okResponse( fixture ) );
    const fresh = await fetchModels();
    cache.expiresAt = 0; // force refetch so the failure opens the cooldown

    fetchMock.mockRejectedValueOnce( new Error( 'network failure' ) );
    const stale = await fetchModelsPricing();
    const afterCooldown = await fetchModelsPricing();

    expect( fetchMock ).toHaveBeenCalledTimes( 2 );
    expect( stale.models ).toBe( fresh );
    expect( afterCooldown.models ).toBe( fresh );
    expect( afterCooldown.freshness ).toBe( Freshness.STALE );
  } );

  it( 'retries the live request once the cooldown window has elapsed', async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockRejectedValueOnce( new Error( 'network failure' ) );
      await fetchModelsPricing();

      vi.advanceTimersByTime( cooldownTTL - 1000 );
      await fetchModelsPricing();
      expect( fetchMock ).toHaveBeenCalledTimes( 1 );

      vi.advanceTimersByTime( 2000 );
      stubFetch( okResponse( fixture ) );
      const { models: result, freshness } = await fetchModelsPricing();

      expect( fetchMock ).toHaveBeenCalledTimes( 2 );
      expect( freshness ).toBe( Freshness.LIVE );
      expect( result.get( 'openai/gpt-4o-2024-11-20' ) ).toEqual( fixture.openai.models['gpt-4o-2024-11-20'].cost );
    } finally {
      vi.useRealTimers();
    }
  } );

  it( 'returns cached Map when cache is still valid', async () => {
    const fetchMock = stubFetch( okResponse( fixture ) );

    const first = await fetchModelsPricing();
    const second = await fetchModelsPricing();

    expect( first.models ).toBe( second.models );
    expect( first.freshness ).toBe( Freshness.LIVE );
    expect( second.freshness ).toBe( Freshness.CACHED );
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

    const result = await fetchModels();

    expect( result.get( 'p1/withCost' ) ).toEqual( { input: 1, output: 2 } );
    expect( result.get( 'withCost' ) ).toBeUndefined();
    expect( result.get( 'p1/noCost' ) ).toBeUndefined();
  } );

  it( 'treats an ok response with no priced models as a failure', async () => {
    stubFetch( okResponse( { p1: { models: { noCost: { name: 'x' } } } } ) );

    const { models, freshness } = await fetchModelsPricing();

    expect( freshness ).toBe( Freshness.SNAPSHOT );
    expect( models.size ).toBe( fallbackEntries.length );
    expect( cache.content ).toBeNull();
    expect( state.ignoreLiveRequestsUntil ).toBeGreaterThan( Date.now() );
  } );

  it( 'keeps the stale cache when a refresh returns an empty table', async () => {
    stubFetch( okResponse( fixture ) );
    const fresh = await fetchModels();
    cache.expiresAt = 0; // force refetch so the empty response is parsed

    stubFetch( okResponse( {} ) );
    const { models, freshness } = await fetchModelsPricing();

    expect( models ).toBe( fresh );
    expect( freshness ).toBe( Freshness.STALE );
  } );
} );
