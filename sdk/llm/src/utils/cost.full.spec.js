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

vi.mock( './models_pricing.js', () => ( {
  fetchModelsPricing: ( ...args ) => mockFetchModelsPricing( ...args )
} ) );

import { LLMGenerationCost, LLMGenerationCostItem, calculateCosts } from './cost.js';
import { LLMGenerationUsageItem, parseLLMUsage } from './usage.js';

const INPUT = LLMGenerationUsageItem.Group.INPUT;
const OUTPUT = LLMGenerationUsageItem.Group.OUTPUT;
const OK = LLMGenerationCostItem.Status.OK;
const FALLBACK = LLMGenerationCostItem.Status.FALLBACK;
const MISSING = LLMGenerationCostItem.Status.MISSING;

const models = new Map(
  Object.values( pricingTable ).flatMap( provider => Object.entries( provider.models ?? {} ).flatMap( ( [ modelId, model ] ) => (
    model.cost ? [ [ `${provider.id}/${modelId}`, model.cost ] ] : []
  ) ) )
);

const cases = [
  {
    name: 'OpenAI text',
    fixture: openaiText,
    providerId: 'openai',
    modelId: 'gpt-4.1-mini',
    input: 0.000414,
    output: 0.0006336,
    total: 0.0010476,
    status: LLMGenerationCost.Status.IMPRECISE,
    items: [
      [ INPUT, 'no_cache', 1035, 0.4, 0.000414, OK ],
      [ INPUT, 'cache_read', 0, 0.1, 0, OK ],
      [ INPUT, 'cache_write', 0, 0.4, 0, FALLBACK ],
      [ OUTPUT, 'text', 396, 1.6, 0.0006336, OK ],
      [ OUTPUT, 'reasoning', 0, 1.6, 0, FALLBACK ]
    ]
  },
  {
    name: 'OpenAI stream',
    fixture: openaiStream,
    providerId: 'openai',
    modelId: 'gpt-4.1-mini',
    input: 0.000414,
    output: 0.0006176,
    total: 0.0010316,
    status: LLMGenerationCost.Status.IMPRECISE,
    items: [
      [ INPUT, 'no_cache', 1035, 0.4, 0.000414, OK ],
      [ INPUT, 'cache_read', 0, 0.1, 0, OK ],
      [ INPUT, 'cache_write', 0, 0.4, 0, FALLBACK ],
      [ OUTPUT, 'text', 386, 1.6, 0.0006176, OK ],
      [ OUTPUT, 'reasoning', 0, 1.6, 0, FALLBACK ]
    ]
  },
  {
    name: 'OpenAI image',
    fixture: openaiImage,
    providerId: 'openai',
    modelId: 'gpt-image-1',
    input: null,
    output: null,
    total: null,
    status: LLMGenerationCost.Status.INCOMPLETE,
    items: [
      [ INPUT, null, 151, null, null, MISSING ],
      [ OUTPUT, null, 4160, null, null, MISSING ]
    ]
  },
  {
    name: 'Anthropic text',
    fixture: anthropicText,
    providerId: 'anthropic',
    modelId: 'claude-haiku-4-5',
    input: 0.001113,
    output: 0.004225,
    total: 0.005338,
    status: LLMGenerationCost.Status.PRECISE,
    items: [
      [ INPUT, 'no_cache', 1113, 1, 0.001113, OK ],
      [ INPUT, 'cache_read', 0, 0.1, 0, OK ],
      [ INPUT, 'cache_write', 0, 1.25, 0, OK ],
      [ OUTPUT, null, 845, 5, 0.004225, OK ]
    ]
  },
  {
    name: 'Anthropic stream',
    fixture: anthropicStream,
    providerId: 'anthropic',
    modelId: 'claude-haiku-4-5',
    input: 0.001113,
    output: 0.005235,
    total: 0.006348,
    status: LLMGenerationCost.Status.PRECISE,
    items: [
      [ INPUT, 'no_cache', 1113, 1, 0.001113, OK ],
      [ INPUT, 'cache_read', 0, 0.1, 0, OK ],
      [ INPUT, 'cache_write', 0, 1.25, 0, OK ],
      [ OUTPUT, null, 1047, 5, 0.005235, OK ]
    ]
  },
  {
    name: 'Anthropic cache seed',
    fixture: anthropicCacheSeed,
    providerId: 'anthropic',
    modelId: 'claude-haiku-4-5',
    input: 0.01876625,
    output: 0.000025,
    total: 0.01879125,
    status: LLMGenerationCost.Status.PRECISE,
    items: [
      [ INPUT, 'no_cache', 15, 1, 0.000015, OK ],
      [ INPUT, 'cache_read', 0, 0.1, 0, OK ],
      [ INPUT, 'cache_write', 15001, 1.25, 0.01875125, OK ],
      [ OUTPUT, null, 5, 5, 0.000025, OK ]
    ]
  },
  {
    name: 'Anthropic cache read and write',
    fixture: anthropicCacheReadWrite,
    providerId: 'anthropic',
    modelId: 'claude-haiku-4-5',
    input: 0.0065166,
    output: 0.00002,
    total: 0.0065366,
    status: LLMGenerationCost.Status.PRECISE,
    items: [
      [ INPUT, 'no_cache', 14, 1, 0.000014, OK ],
      [ INPUT, 'cache_read', 15001, 0.1, 0.0015001, OK ],
      [ INPUT, 'cache_write', 4002, 1.25, 0.0050025, OK ],
      [ OUTPUT, null, 4, 5, 0.00002, OK ]
    ]
  },
  {
    name: 'Google Vertex text',
    fixture: googleVertexText,
    providerId: 'google-vertex',
    modelId: 'gemini-2.5-flash',
    input: 0.0003096,
    output: 0.0034525,
    total: 0.0037621,
    status: LLMGenerationCost.Status.IMPRECISE,
    items: [
      [ INPUT, 'no_cache', 1032, 0.3, 0.0003096, OK ],
      [ INPUT, 'cache_read', 0, 0.03, 0, OK ],
      [ OUTPUT, 'text', 793, 2.5, 0.0019825, OK ],
      [ OUTPUT, 'reasoning', 588, 2.5, 0.00147, FALLBACK ]
    ]
  },
  {
    name: 'Google Vertex stream',
    fixture: googleVertexStream,
    providerId: 'google-vertex',
    modelId: 'gemini-2.5-flash',
    input: 0.0003096,
    output: 0.0033675,
    total: 0.0036771,
    status: LLMGenerationCost.Status.IMPRECISE,
    items: [
      [ INPUT, 'no_cache', 1032, 0.3, 0.0003096, OK ],
      [ INPUT, 'cache_read', 0, 0.03, 0, OK ],
      [ OUTPUT, 'text', 858, 2.5, 0.002145, OK ],
      [ OUTPUT, 'reasoning', 489, 2.5, 0.0012225, FALLBACK ]
    ]
  },
  {
    name: 'Google Vertex image',
    fixture: googleVertexImage,
    providerId: 'google-vertex',
    modelId: 'gemini-2.5-flash-image',
    input: 0.0000471,
    output: 0.0387,
    total: 0.0387471,
    status: LLMGenerationCost.Status.PRECISE,
    items: [
      [ INPUT, null, 157, 0.3, 0.0000471, OK ],
      [ OUTPUT, null, 1290, 30, 0.0387, OK ]
    ]
  },
  {
    name: 'Perplexity text',
    fixture: perplexityText,
    providerId: 'perplexity',
    modelId: 'sonar',
    input: 0.001025,
    output: 0.000437,
    total: 0.001462,
    status: LLMGenerationCost.Status.IMPRECISE,
    items: [
      [ INPUT, 'no_cache', 1025, 1, 0.001025, OK ],
      [ OUTPUT, 'text', 437, 1, 0.000437, OK ],
      [ OUTPUT, 'reasoning', 0, 1, 0, FALLBACK ]
    ]
  },
  {
    name: 'Perplexity stream',
    fixture: perplexityStream,
    providerId: 'perplexity',
    modelId: 'sonar',
    input: 0.001025,
    output: 0.000448,
    total: 0.001473,
    status: LLMGenerationCost.Status.IMPRECISE,
    items: [
      [ INPUT, 'no_cache', 1025, 1, 0.001025, OK ],
      [ OUTPUT, 'text', 448, 1, 0.000448, OK ],
      [ OUTPUT, 'reasoning', 0, 1, 0, FALLBACK ]
    ]
  }
];

describe( 'calculateCosts with AI SDK response fixtures', () => {
  beforeEach( () => {
    mockFetchModelsPricing.mockReset();
    mockFetchModelsPricing.mockResolvedValue( models );
  } );

  it.each( cases )( 'calculates $name cost', async ( {
    fixture,
    providerId,
    modelId,
    input,
    output,
    total,
    status,
    items
  } ) => {
    const usage = parseLLMUsage( {
      prompt: {
        config: {
          provider: providerId,
          model: modelId
        }
      },
      usage: fixture.usage
    } );
    const result = await calculateCosts( usage );

    expect( JSON.parse( JSON.stringify( result ) ) ).toEqual( {
      type: LLMGenerationCost.TYPE,
      providerId,
      modelId,
      input,
      output,
      total,
      status,
      items: items.map( ( [ group, label, amount, ppm, itemTotal, itemStatus ] ) => ( {
        group,
        label,
        amount,
        ppm,
        total: itemTotal,
        status: itemStatus
      } ) )
    } );
  } );
} );
