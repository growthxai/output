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

const fetchMock = vi.hoisted( () => vi.fn() );
const EnvHttpProxyAgentMock = vi.hoisted( () => vi.fn( function EnvHttpProxyAgent( options ) {
  this.options = options;
} ) );

vi.mock( 'undici', () => ( {
  EnvHttpProxyAgent: EnvHttpProxyAgentMock,
  fetch: fetchMock
} ) );

import { cache } from './fetch_models_pricing.js';
import { calculateLLMCallCost } from './index.js';

const cases = [
  {
    name: 'OpenAI text',
    fixture: openaiText,
    providerId: 'openai',
    modelId: 'gpt-4.1-mini',
    expectedTotal: 0.0010476,
    expectedTokens: 1431,
    expectedUsage: [
      { type: 'input', ppm: 0.4, amount: 1035, total: 0.000414 },
      { type: 'input_cache_read', ppm: 0.1, amount: 0, total: 0 },
      { type: 'input_cache_write', ppm: 0.4, amount: 0, total: 0 },
      { type: 'output', ppm: 1.6, amount: 396, total: 0.0006336 },
      { type: 'output_reasoning', ppm: 1.6, amount: 0, total: 0 }
    ]
  },
  {
    name: 'OpenAI stream',
    fixture: openaiStream,
    providerId: 'openai',
    modelId: 'gpt-4.1-mini',
    expectedTotal: 0.0010316,
    expectedTokens: 1421,
    expectedUsage: [
      { type: 'input', ppm: 0.4, amount: 1035, total: 0.000414 },
      { type: 'input_cache_read', ppm: 0.1, amount: 0, total: 0 },
      { type: 'input_cache_write', ppm: 0.4, amount: 0, total: 0 },
      { type: 'output', ppm: 1.6, amount: 386, total: 0.0006176 },
      { type: 'output_reasoning', ppm: 1.6, amount: 0, total: 0 }
    ]
  },
  {
    name: 'OpenAI image',
    fixture: openaiImage,
    providerId: 'openai',
    modelId: 'gpt-image-1',
    expectedTotal: null,
    expectedTokens: null,
    expectedUsage: null
  },
  {
    name: 'Anthropic text',
    fixture: anthropicText,
    providerId: 'anthropic',
    modelId: 'claude-haiku-4-5',
    expectedTotal: 0.005338,
    expectedTokens: 1958,
    expectedUsage: [
      { type: 'input', ppm: 1, amount: 1113, total: 0.001113 },
      { type: 'input_cache_read', ppm: 0.1, amount: 0, total: 0 },
      { type: 'input_cache_write', ppm: 1.25, amount: 0, total: 0 },
      { type: 'output', ppm: 5, amount: 845, total: 0.004225 }
    ]
  },
  {
    name: 'Anthropic stream',
    fixture: anthropicStream,
    providerId: 'anthropic',
    modelId: 'claude-haiku-4-5',
    expectedTotal: 0.006348,
    expectedTokens: 2160,
    expectedUsage: [
      { type: 'input', ppm: 1, amount: 1113, total: 0.001113 },
      { type: 'input_cache_read', ppm: 0.1, amount: 0, total: 0 },
      { type: 'input_cache_write', ppm: 1.25, amount: 0, total: 0 },
      { type: 'output', ppm: 5, amount: 1047, total: 0.005235 }
    ]
  },
  {
    name: 'Anthropic cache seed',
    fixture: anthropicCacheSeed,
    providerId: 'anthropic',
    modelId: 'claude-haiku-4-5',
    expectedTotal: 0.01879125,
    expectedTokens: 15021,
    expectedUsage: [
      { type: 'input', ppm: 1, amount: 15, total: 0.000015 },
      { type: 'input_cache_read', ppm: 0.1, amount: 0, total: 0 },
      { type: 'input_cache_write', ppm: 1.25, amount: 15001, total: 0.01875125 },
      { type: 'output', ppm: 5, amount: 5, total: 0.000025 }
    ]
  },
  {
    name: 'Anthropic cache read and write',
    fixture: anthropicCacheReadWrite,
    providerId: 'anthropic',
    modelId: 'claude-haiku-4-5',
    expectedTotal: 0.0065366,
    expectedTokens: 19021,
    expectedUsage: [
      { type: 'input', ppm: 1, amount: 14, total: 0.000014 },
      { type: 'input_cache_read', ppm: 0.1, amount: 15001, total: 0.0015001 },
      { type: 'input_cache_write', ppm: 1.25, amount: 4002, total: 0.0050025 },
      { type: 'output', ppm: 5, amount: 4, total: 0.00002 }
    ]
  },
  {
    name: 'Google Vertex text',
    fixture: googleVertexText,
    providerId: 'google-vertex',
    modelId: 'gemini-2.5-flash',
    expectedTotal: 0.0037621,
    expectedTokens: 2413,
    expectedUsage: [
      { type: 'input', ppm: 0.3, amount: 1032, total: 0.0003096 },
      { type: 'input_cache_read', ppm: 0.03, amount: 0, total: 0 },
      { type: 'output', ppm: 2.5, amount: 793, total: 0.0019825 },
      { type: 'output_reasoning', ppm: 2.5, amount: 588, total: 0.00147 }
    ]
  },
  {
    name: 'Google Vertex stream',
    fixture: googleVertexStream,
    providerId: 'google-vertex',
    modelId: 'gemini-2.5-flash',
    expectedTotal: 0.0036771,
    expectedTokens: 2379,
    expectedUsage: [
      { type: 'input', ppm: 0.3, amount: 1032, total: 0.0003096 },
      { type: 'input_cache_read', ppm: 0.03, amount: 0, total: 0 },
      { type: 'output', ppm: 2.5, amount: 858, total: 0.002145 },
      { type: 'output_reasoning', ppm: 2.5, amount: 489, total: 0.0012225 }
    ]
  },
  {
    name: 'Google Vertex image',
    fixture: googleVertexImage,
    providerId: 'google-vertex',
    modelId: 'gemini-2.5-flash-image',
    expectedTotal: 0.0387471,
    expectedTokens: 1447,
    expectedUsage: [
      { type: 'input', ppm: 0.3, amount: 157, total: 0.0000471 },
      { type: 'output', ppm: 30, amount: 1290, total: 0.0387 }
    ]
  },
  {
    name: 'Perplexity text',
    fixture: perplexityText,
    providerId: 'perplexity',
    modelId: 'sonar',
    expectedTotal: 0.001462,
    expectedTokens: 1462,
    expectedUsage: [
      { type: 'input', ppm: 1, amount: 1025, total: 0.001025 },
      { type: 'output', ppm: 1, amount: 437, total: 0.000437 },
      { type: 'output_reasoning', ppm: 1, amount: 0, total: 0 }
    ]
  },
  {
    name: 'Perplexity stream',
    fixture: perplexityStream,
    providerId: 'perplexity',
    modelId: 'sonar',
    expectedTotal: 0.001473,
    expectedTokens: 1473,
    expectedUsage: [
      { type: 'input', ppm: 1, amount: 1025, total: 0.001025 },
      { type: 'output', ppm: 1, amount: 448, total: 0.000448 },
      { type: 'output_reasoning', ppm: 1, amount: 0, total: 0 }
    ]
  }
];

describe( 'calculateLLMCallCost with AI SDK response fixtures', () => {
  beforeEach( () => {
    cache.content = null;
    cache.expiresAt = 0;
    fetchMock.mockReset();
    fetchMock.mockResolvedValue( {
      ok: true,
      json: () => Promise.resolve( pricingTable )
    } );
  } );

  it.each( cases )( 'calculates the cost for $name', async ( {
    fixture,
    providerId,
    modelId,
    expectedTotal,
    expectedTokens,
    expectedUsage
  } ) => {
    const result = await calculateLLMCallCost( {
      providerId,
      modelId,
      usage: fixture.usage
    } );

    if ( expectedTotal === null ) {
      expect( result ).toBeNull();
      return;
    }

    expect( result ).toMatchObject( {
      modelId,
      tokensUsed: expectedTokens
    } );
    expect( result.usage ).toEqual( expectedUsage );
    expect( result.total ).toBeCloseTo( expectedTotal, 10 );
  } );
} );
