import { beforeEach, describe, expect, it, vi } from 'vitest';
import { req1 as anthropicCacheSeed, req2 as anthropicCacheReadWrite } from '../fixtures/text_response_v7_anthropic_cache.js';
import anthropicStream from '../fixtures/stream_response_v7_anthropic.js';
import anthropicText from '../fixtures/text_response_v7_anthropic.js';
import googleVertexImage from '../fixtures/image_response_v7_google_vertex.js';
import googleVertexStream from '../fixtures/stream_response_v7_google_vertex.js';
import googleVertexText from '../fixtures/text_response_v7_google_vertex.js';
import openaiImage from '../fixtures/image_response_v7_openai.js';
import openaiStream from '../fixtures/stream_response_v7_openai.js';
import openaiText from '../fixtures/text_response_v7_openai.js';
import perplexityStream from '../fixtures/stream_response_v7_perplexity.js';
import perplexityText from '../fixtures/text_response_v7_perplexity.js';
import pricingTable from '../fixtures/models_api_v7_subset.json' with { type: 'json' };

const mockFetchModelsPricing = vi.hoisted( () => vi.fn() );

vi.mock( '#runtime_logger', () => {
  const createLogger = () => ( { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } );
  return { Logger: { ...createLogger(), createLogger } };
} );

vi.mock( '#tracing', async importOriginal => ( {
  ...await importOriginal(),
  addEventActionWithContext: vi.fn()
} ) );

vi.mock( '#bus', () => ( {
  stepEventBus: { emit: vi.fn() }
} ) );

vi.mock( './models_pricing.js', async importOriginal => ( {
  ...await importOriginal(),
  fetchModelsPricing: ( ...args ) => mockFetchModelsPricing( ...args )
} ) );

import { addEventActionWithContext } from '#tracing';
import { stepEventBus } from '#bus';
import { Logger } from '#runtime_logger';
import { Metering } from './metering.js';
import { Freshness } from './models_pricing.js';

const traceId = 'generateText-9000000000-a1b2c3d4';

const models = new Map(
  Object.values( pricingTable ).flatMap( provider => Object.entries( provider.models ?? {} ).flatMap( ( [ modelId, model ] ) => (
    model.cost ? [ [ `${provider.id}/${modelId}`, { cost: model.cost, reasoning: model.reasoning === true } ] ] : []
  ) ) )
);

// `ids` are the request ids found in the fixture headers: `request-id` for Anthropic, `x-request-id` for
// OpenAI and Perplexity, none for Vertex. Text and stream fixtures carry their headers on the steps, image
// fixtures on `responses`.
const cases = [
  { name: 'OpenAI text', fixture: openaiText, providerId: 'openai', modelId: 'gpt-4.1-mini', ids: [ 'req-id' ] },
  { name: 'OpenAI stream', fixture: openaiStream, providerId: 'openai', modelId: 'gpt-4.1-mini', ids: [ 'req-id' ] },
  { name: 'OpenAI image', fixture: openaiImage, providerId: 'openai', modelId: 'gpt-image-1', ids: [ 'req_id' ] },
  { name: 'Anthropic text', fixture: anthropicText, providerId: 'anthropic', modelId: 'claude-haiku-4-5', ids: [ 'req-id' ] },
  { name: 'Anthropic stream', fixture: anthropicStream, providerId: 'anthropic', modelId: 'claude-haiku-4-5', ids: [ 'req-id' ] },
  { name: 'Anthropic cache seed', fixture: anthropicCacheSeed, providerId: 'anthropic', modelId: 'claude-haiku-4-5', ids: [ 'req-id' ] },
  {
    name: 'Anthropic cache read and write',
    fixture: anthropicCacheReadWrite,
    providerId: 'anthropic',
    modelId: 'claude-haiku-4-5',
    ids: [ 'req-id' ]
  },
  { name: 'Google Vertex text', fixture: googleVertexText, providerId: 'google-vertex', modelId: 'gemini-2.5-flash', ids: [] },
  { name: 'Google Vertex stream', fixture: googleVertexStream, providerId: 'google-vertex', modelId: 'gemini-2.5-flash', ids: [] },
  { name: 'Google Vertex image', fixture: googleVertexImage, providerId: 'google-vertex', modelId: 'gemini-2.5-flash-image', ids: [] },
  { name: 'Perplexity text', fixture: perplexityText, providerId: 'perplexity', modelId: 'sonar', ids: [ 'req-id' ] },
  { name: 'Perplexity stream', fixture: perplexityStream, providerId: 'perplexity', modelId: 'sonar', ids: [ 'req-id' ] }
];

const toPlain = value => JSON.parse( JSON.stringify( value ) );

describe( 'Metering with AI SDK response fixtures', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    mockFetchModelsPricing.mockResolvedValue( { models, freshness: Freshness.LIVE } );
  } );

  it.each( cases )( 'reports the request details of $name', async ( { fixture, providerId, modelId, ids } ) => {
    const prompt = { name: 'writer@v1', config: { provider: providerId, model: modelId } };
    const metering = new Metering( { traceId, prompt } );

    await metering.bill( fixture );

    const { usage, cost, legacy } = metering.attributes;

    // bill() swallows errors, so a failure would otherwise show up only as missing attributes
    expect( Logger.error ).not.toHaveBeenCalled();

    const requestDetails = { ids, count: 1, duration: expect.any( Number ) };

    expect( toPlain( usage ) ).toMatchObject( { promptName: 'writer@v1', requestDetails } );
    expect( toPlain( cost ) ).toMatchObject( { promptName: 'writer@v1', requestDetails } );
    expect( Number.isInteger( usage.requestDetails.duration ) ).toBe( true );
    expect( usage.requestDetails.duration ).toBeGreaterThan( 0 );
    expect( cost.requestDetails ).toBe( usage.requestDetails );
    expect( legacy?.requestDetails ).toBeUndefined();
  } );

  it.each( cases )( 'attaches and emits the same request details for $name', async ( { fixture, providerId, modelId } ) => {
    const prompt = { name: 'writer@v1', config: { provider: providerId, model: modelId } };
    const metering = new Metering( { traceId, prompt } );

    await metering.bill( fixture );

    const { usage, cost } = metering.attributes;

    expect( Logger.error ).not.toHaveBeenCalled();

    const attached = addEventActionWithContext.mock.calls.map( ( [ , { details } ] ) => details );
    const [ [ eventName, payload ] ] = stepEventBus.emit.mock.calls;

    expect( attached ).toEqual( expect.arrayContaining( [ usage, cost ] ) );
    expect( eventName ).toBe( 'sdk:llm:generation:metering' );
    expect( payload.usage.requestDetails ).toEqual( usage.requestDetails );
    expect( payload.cost.requestDetails ).toEqual( usage.requestDetails );
  } );
} );
