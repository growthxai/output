import { describe, expect, it } from 'vitest';
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
import { LLMGenerationUsage, LLMGenerationUsageItem, parseLLMUsage } from './usage.js';

const INPUT = LLMGenerationUsageItem.Group.INPUT;
const OUTPUT = LLMGenerationUsageItem.Group.OUTPUT;
const REQUEST = LLMGenerationUsageItem.Group.REQUEST;

const cases = [
  {
    name: 'OpenAI text',
    fixture: openaiText,
    providerId: 'openai',
    modelId: 'gpt-4.1-mini',
    input: 1035,
    output: 396,
    items: [
      { group: INPUT, label: 'no_cache', amount: 1035 },
      { group: INPUT, label: 'cache_read', amount: 0 },
      { group: INPUT, label: 'cache_write', amount: 0 },
      { group: OUTPUT, label: 'text', amount: 396 },
      { group: OUTPUT, label: 'reasoning', amount: 0 }
    ]
  },
  {
    name: 'OpenAI stream',
    fixture: openaiStream,
    providerId: 'openai',
    modelId: 'gpt-4.1-mini',
    input: 1035,
    output: 386,
    items: [
      { group: INPUT, label: 'no_cache', amount: 1035 },
      { group: INPUT, label: 'cache_read', amount: 0 },
      { group: INPUT, label: 'cache_write', amount: 0 },
      { group: OUTPUT, label: 'text', amount: 386 },
      { group: OUTPUT, label: 'reasoning', amount: 0 }
    ]
  },
  {
    name: 'OpenAI image',
    fixture: openaiImage,
    providerId: 'openai',
    modelId: 'gpt-image-1',
    input: 151,
    output: 4160,
    items: [
      { group: INPUT, label: null, amount: 151 },
      { group: OUTPUT, label: null, amount: 4160 }
    ]
  },
  {
    name: 'Anthropic text',
    fixture: anthropicText,
    providerId: 'anthropic',
    modelId: 'claude-haiku-4-5',
    input: 1113,
    output: 845,
    items: [
      { group: INPUT, label: 'no_cache', amount: 1113 },
      { group: INPUT, label: 'cache_read', amount: 0 },
      { group: INPUT, label: 'cache_write', amount: 0 },
      { group: OUTPUT, label: null, amount: 845 }
    ]
  },
  {
    name: 'Anthropic stream',
    fixture: anthropicStream,
    providerId: 'anthropic',
    modelId: 'claude-haiku-4-5',
    input: 1113,
    output: 1047,
    items: [
      { group: INPUT, label: 'no_cache', amount: 1113 },
      { group: INPUT, label: 'cache_read', amount: 0 },
      { group: INPUT, label: 'cache_write', amount: 0 },
      { group: OUTPUT, label: null, amount: 1047 }
    ]
  },
  {
    name: 'Anthropic cache seed',
    fixture: anthropicCacheSeed,
    providerId: 'anthropic',
    modelId: 'claude-haiku-4-5',
    input: 15016,
    output: 5,
    items: [
      { group: INPUT, label: 'no_cache', amount: 15 },
      { group: INPUT, label: 'cache_read', amount: 0 },
      { group: INPUT, label: 'cache_write', amount: 15001 },
      { group: OUTPUT, label: null, amount: 5 }
    ]
  },
  {
    name: 'Anthropic cache read and write',
    fixture: anthropicCacheReadWrite,
    providerId: 'anthropic',
    modelId: 'claude-haiku-4-5',
    input: 19017,
    output: 4,
    items: [
      { group: INPUT, label: 'no_cache', amount: 14 },
      { group: INPUT, label: 'cache_read', amount: 15001 },
      { group: INPUT, label: 'cache_write', amount: 4002 },
      { group: OUTPUT, label: null, amount: 4 }
    ]
  },
  {
    name: 'Google Vertex text',
    fixture: googleVertexText,
    providerId: 'google-vertex',
    modelId: 'gemini-2.5-flash',
    input: 1032,
    output: 1381,
    items: [
      { group: INPUT, label: 'no_cache', amount: 1032 },
      { group: INPUT, label: 'cache_read', amount: 0 },
      { group: OUTPUT, label: 'text', amount: 793 },
      { group: OUTPUT, label: 'reasoning', amount: 588 },
      { group: REQUEST, label: 'grounding_prompt', amount: 1 }
    ]
  },
  {
    name: 'Google Vertex stream',
    fixture: googleVertexStream,
    providerId: 'google-vertex',
    modelId: 'gemini-2.5-flash',
    input: 1032,
    output: 1347,
    items: [
      { group: INPUT, label: 'no_cache', amount: 1032 },
      { group: INPUT, label: 'cache_read', amount: 0 },
      { group: OUTPUT, label: 'text', amount: 858 },
      { group: OUTPUT, label: 'reasoning', amount: 489 }
    ]
  },
  {
    name: 'Google Vertex image',
    fixture: googleVertexImage,
    providerId: 'google-vertex',
    modelId: 'gemini-2.5-flash-image',
    input: 157,
    output: 1290,
    items: [
      { group: INPUT, label: null, amount: 157 },
      { group: OUTPUT, label: null, amount: 1290 }
    ]
  },
  {
    name: 'Perplexity text',
    fixture: perplexityText,
    providerId: 'perplexity',
    modelId: 'sonar',
    input: 1025,
    output: 437,
    items: [
      { group: INPUT, label: 'no_cache', amount: 1025 },
      { group: OUTPUT, label: 'text', amount: 437 },
      { group: OUTPUT, label: 'reasoning', amount: 0 }
    ]
  },
  {
    name: 'Perplexity stream',
    fixture: perplexityStream,
    providerId: 'perplexity',
    modelId: 'sonar',
    input: 1025,
    output: 448,
    items: [
      { group: INPUT, label: 'no_cache', amount: 1025 },
      { group: OUTPUT, label: 'text', amount: 448 },
      { group: OUTPUT, label: 'reasoning', amount: 0 }
    ]
  }
];

describe( 'parseLLMUsage with AI SDK response fixtures', () => {
  it.each( cases )( 'normalizes $name usage', ( {
    fixture,
    providerId,
    modelId,
    input,
    output,
    items
  } ) => {
    const result = parseLLMUsage( {
      prompt: {
        config: {
          provider: providerId,
          model: modelId
        }
      },
      usage: fixture.usage,
      steps: fixture.steps
    } );

    expect( JSON.parse( JSON.stringify( result ) ) ).toEqual( {
      type: LLMGenerationUsage.TYPE,
      providerId,
      modelId,
      status: LLMGenerationUsage.Status.COMPLETE,
      input,
      output,
      total: input + output,
      items
    } );
  } );
} );
