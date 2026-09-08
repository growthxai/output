import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchModelsPricing, cache } from './models_pricing.js';
import fixture from '../fixtures/models_api_light.json' with { type: 'json' };
import fallbackJson from './models_pricing_fallback.json' with { type: 'json' };

const fetchMock = vi.hoisted( () => vi.fn() );
const EnvHttpProxyAgentMock = vi.hoisted( () => vi.fn( function EnvHttpProxyAgent( options ) {
  this.options = options;
} ) );

vi.mock( 'undici', () => ( {
  EnvHttpProxyAgent: EnvHttpProxyAgentMock,
  fetch: fetchMock
} ) );

const costTableUrl = 'https://models.dev/api.json';
const okResponse = data => ( {
  ok: true,
  json: () => Promise.resolve( data )
} );
const stubFetch = response => {
  fetchMock.mockResolvedValueOnce( response );
  return fetchMock;
};
const fallbackEntries = Object.values( fallbackJson )
  .flatMap( provider => Object.values( provider.models ) )
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
    expect( result.get( firstModelId ) ).toBeUndefined();
    expect( result.get( `${firstModel.id}/${firstModelId}` ) ).toEqual( cost );
  } );

  it( 'includes main providers from fixture (openai, anthropic, google, nvidia, perplexity)', async () => {
    stubFetch( okResponse( fixture ) );

    const result = await fetchModelsPricing();

    const openaiProvider = fixture.openai;
    const openaiModelId = Object.keys( openaiProvider.models )[0];
    expect( result.get( openaiModelId ) ).toBeUndefined();
    expect( result.get( `openai/${openaiModelId}` ) ).toEqual( openaiProvider.models[openaiModelId].cost );

    const anthropicModelId = Object.keys( fixture.anthropic.models )[0];
    expect( result.get( `anthropic/${anthropicModelId}` ) ).toEqual( fixture.anthropic.models[anthropicModelId].cost );
  } );

  it( 'keeps separate costs when the same model id exists under two providers', async () => {
    stubFetch( okResponse( fixture ) );

    const result = await fetchModelsPricing();
    const sharedModelId = 'gpt-4o-2024-11-20';

    expect( result.get( sharedModelId ) ).toBeUndefined();
    expect( result.get( `openai/${sharedModelId}` ) ).toEqual( fixture.openai.models[sharedModelId].cost );
    expect( result.get( `azure/${sharedModelId}` ) ).toEqual( fixture.azure.models[sharedModelId].cost );
    expect( result.get( `openai/${sharedModelId}` ) ).not.toEqual( result.get( `azure/${sharedModelId}` ) );
  } );

  it( 'returns the bundled fallback table when response is not ok and no cache', async () => {
    const status = 500;
    stubFetch( { ok: false, status } );

    const result = await fetchModelsPricing();

    expect( result ).toBeInstanceOf( Map );
    expect( result.size ).toBe( fallbackEntries.length );
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

  it( 'returns the bundled fallback table when fetch rejects and no cache', async () => {
    const error = new Error( 'network failure' );
    fetchMock.mockRejectedValueOnce( error );

    const result = await fetchModelsPricing();

    expect( result ).toBeInstanceOf( Map );
    expect( result.size ).toBe( fallbackEntries.length );
    expect( result.get( 'openai/gpt-4o-2024-11-20' ) ).toEqual( fallbackJson.openai.models['gpt-4o-2024-11-20'].cost );
    expect( result.get( 'gpt-4o-2024-11-20' ) ).toBeUndefined();
  } );

  it( 'maps the stripped fallback entry to the same cost as the full models.dev table', async () => {
    const providerId = 'openai';
    const modelId = 'gpt-4o-2024-11-20';
    const { cost } = fallbackJson[providerId].models[modelId];
    stubFetch( okResponse( fullTable( providerId, modelId, cost ) ) );

    const remote = await fetchModelsPricing();

    cache.content = null;
    cache.expiresAt = 0;
    fetchMock.mockRejectedValueOnce( new Error( 'network failure' ) );
    const fallback = await fetchModelsPricing();

    expect( remote.get( `${providerId}/${modelId}` ) ).toEqual( fallback.get( `${providerId}/${modelId}` ) );
    expect( fallback.get( `${providerId}/${modelId}` ) ).toEqual( { input: 2.5, output: 10, cache_read: 1.25 } );
  } );

  it( 'covers every provider in the fallback table', async () => {
    fetchMock.mockRejectedValueOnce( new Error( 'network failure' ) );

    const result = await fetchModelsPricing();

    for ( const providerId of Object.keys( fallbackJson ) ) {
      const modelId = Object.keys( fallbackJson[providerId].models )[0];
      expect( result.get( `${providerId}/${modelId}` ) ).toEqual( fallbackJson[providerId].models[modelId].cost );
    }
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

    expect( result.get( 'p1/withCost' ) ).toEqual( { input: 1, output: 2 } );
    expect( result.get( 'withCost' ) ).toBeUndefined();
    expect( result.get( 'p1/noCost' ) ).toBeUndefined();
  } );
} );
