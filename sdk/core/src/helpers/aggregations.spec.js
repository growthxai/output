import { describe, expect, it } from 'vitest';
import { Attribute } from '#trace_attribute';
import { aggregateAttributes } from './aggregations.js';

describe( 'aggregateAttributes', () => {
  it( 'returns zeroed aggregations when there are no attributes', () => {
    expect( aggregateAttributes( [] ) ).toEqual( {
      cost: { total: 0 },
      tokens: { total: 0 },
      httpRequests: { total: 0 }
    } );
  } );

  it( 'aggregates costs, token usage, and HTTP request count by attribute type', () => {
    const attributes = [
      {
        type: Attribute.HTTPRequestCount.TYPE,
        url: 'https://api.example.test/a',
        requestId: 'req-1'
      },
      {
        type: Attribute.HTTPRequestCount.TYPE,
        url: 'https://api.example.test/b',
        requestId: 'req-2'
      },
      {
        type: Attribute.HTTPRequestCost.TYPE,
        url: 'https://api.example.test/a',
        requestId: 'req-1',
        total: 0.2
      },
      {
        type: Attribute.LLMUsage.TYPE,
        modelId: 'gpt-4o',
        total: 0.3,
        tokensUsed: 120,
        usage: [
          { type: 'input', ppm: 1, amount: 100, total: 0.1 },
          { type: 'output', ppm: 2, amount: 20, total: 0.2 }
        ]
      },
      {
        type: Attribute.LLMUsage.TYPE,
        modelId: 'gpt-4o-mini',
        total: 0.05,
        tokensUsed: 30,
        usage: [
          { type: 'input', ppm: 1, amount: 25, total: 0.025 },
          { type: 'reasoning', ppm: 5, amount: 5, total: 0.025 }
        ]
      },
      {
        type: 'unrelated',
        total: 100,
        tokensUsed: 100
      }
    ];

    expect( aggregateAttributes( attributes ) ).toEqual( {
      cost: { total: 0.55 },
      tokens: {
        total: 150,
        input: 125,
        output: 20,
        reasoning: 5
      },
      httpRequests: { total: 2 }
    } );
  } );

  it( 'uses LLMUsage.tokensUsed for total tokens instead of summing usage amounts', () => {
    const attributes = [
      {
        type: Attribute.LLMUsage.TYPE,
        modelId: 'provider-model',
        total: 0.1,
        tokensUsed: 42,
        usage: [
          { type: 'input', ppm: 1, amount: 10, total: 0.01 },
          { type: 'output', ppm: 1, amount: 5, total: 0.005 }
        ]
      }
    ];

    expect( aggregateAttributes( attributes ).tokens ).toEqual( {
      total: 42,
      input: 10,
      output: 5
    } );
  } );
} );

