import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockFetchModelsPricing = vi.hoisted( () => vi.fn() );

vi.mock( './fetch_models_pricing.js', () => ( {
  fetchModelsPricing: ( ...args ) => mockFetchModelsPricing( ...args )
} ) );

vi.mock( '@outputai/core/sdk/runtime', () => {
  class LLMUsage {
    static TYPE = 'llm:usage';
    type = LLMUsage.TYPE;
    modelId;
    usage = [];

    constructor( modelId ) {
      this.modelId = modelId;
    }

    addUsage( { type, ppm, amount } ) {
      this.usage.push( {
        type,
        ppm,
        amount,
        total: ( amount / 1_000_000 ) * ppm
      } );
    }

    get total() {
      return this.usage.reduce( ( total, current ) => total + current.total, 0 );
    }

    get tokensUsed() {
      return this.usage.reduce( ( total, current ) => total + current.amount, 0 );
    }
  }

  return {
    Tracing: {
      Attribute: {
        LLMUsage
      }
    }
  };
} );

import { Tracing } from '@outputai/core/sdk/runtime';
import { calculateLLMCallCost } from './index.js';

const pricingMap = entries => new Map( entries.map( ( [ providerId, modelId, cost ] ) => [
  `${providerId}/${modelId}`,
  cost
] ) );

const expectLLMUsage = ( result, { modelId, usage, total, tokensUsed } ) => {
  expect( result ).toBeInstanceOf( Tracing.Attribute.LLMUsage );
  expect( result ).toEqual( expect.objectContaining( {
    type: Tracing.Attribute.LLMUsage.TYPE,
    modelId,
    usage
  } ) );
  expect( result.total ).toBeCloseTo( total );
  expect( result.tokensUsed ).toBe( tokensUsed );
};

describe( 'calculateLLMCallCost', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  afterEach( () => {
    vi.restoreAllMocks();
  } );

  it( 'returns null when fetchModelsPricing returns null', async () => {
    mockFetchModelsPricing.mockResolvedValue( null );

    const result = await calculateLLMCallCost( {
      providerId: 'openai',
      modelId: 'gpt-4o',
      usage: { inputTokens: 100, outputTokens: 50 }
    } );

    expect( result ).toBeNull();
  } );

  it( 'returns null when model is missing from cost table', async () => {
    mockFetchModelsPricing.mockResolvedValue( new Map() );

    const result = await calculateLLMCallCost( {
      providerId: 'openai',
      modelId: 'unknown-model',
      usage: { inputTokens: 100, outputTokens: 50 }
    } );

    expect( result ).toBeNull();
  } );

  it( 'calculates input and output usage from model pricing', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricingMap( [
      [ 'openai', 'gpt-4o', { input: 2, output: 10, cache_read: 1 } ]
    ] ) );

    const result = await calculateLLMCallCost( {
      providerId: 'openai',
      modelId: 'gpt-4o',
      usage: { inputTokens: 1_000_000, outputTokens: 500_000 }
    } );

    expectLLMUsage( result, {
      modelId: 'gpt-4o',
      usage: [
        { type: 'input', ppm: 2, amount: 1_000_000, total: 2 },
        { type: 'output', ppm: 10, amount: 500_000, total: 5 }
      ],
      total: 7,
      tokensUsed: 1_500_000
    } );
  } );

  it( 'uses each provider pricing when the same model id exists under two providers', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricingMap( [
      [ 'openai', 'gpt-4o', { input: 2, output: 10 } ],
      [ 'azure', 'gpt-4o', { input: 3, output: 12 } ]
    ] ) );
    const usage = { inputTokens: 1_000_000, outputTokens: 0 };

    const openai = await calculateLLMCallCost( {
      providerId: 'openai',
      modelId: 'gpt-4o',
      usage
    } );
    const azure = await calculateLLMCallCost( {
      providerId: 'azure',
      modelId: 'gpt-4o',
      usage
    } );

    expectLLMUsage( openai, {
      modelId: 'gpt-4o',
      usage: [
        { type: 'input', ppm: 2, amount: 1_000_000, total: 2 },
        { type: 'output', ppm: 10, amount: 0, total: 0 }
      ],
      total: 2,
      tokensUsed: 1_000_000
    } );
    expectLLMUsage( azure, {
      modelId: 'gpt-4o',
      usage: [
        { type: 'input', ppm: 3, amount: 1_000_000, total: 3 },
        { type: 'output', ppm: 12, amount: 0, total: 0 }
      ],
      total: 3,
      tokensUsed: 1_000_000
    } );
  } );

  it( 'prices non-cached, cache-read and cache-write input separately', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricingMap( [
      [ 'openai', 'cached-model', { input: 4, cache_read: 1, cache_write: 5, output: 10 } ]
    ] ) );

    const result = await calculateLLMCallCost( {
      providerId: 'openai',
      modelId: 'cached-model',
      usage: {
        inputTokens: 1_000_000,
        inputTokenDetails: {
          noCacheTokens: 500_000,
          cacheReadTokens: 400_000,
          cacheWriteTokens: 100_000
        },
        outputTokens: 100_000
      }
    } );

    expectLLMUsage( result, {
      modelId: 'cached-model',
      usage: [
        { type: 'input', ppm: 4, amount: 500_000, total: 2 },
        { type: 'input_cache_read', ppm: 1, amount: 400_000, total: 0.4 },
        { type: 'input_cache_write', ppm: 5, amount: 100_000, total: 0.5 },
        { type: 'output', ppm: 10, amount: 100_000, total: 1 }
      ],
      total: 3.9,
      tokensUsed: 1_100_000
    } );
  } );

  it( 'falls back to the input rate when cache pricing is missing', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricingMap( [
      [ 'openai', 'no-cache', { input: 2, output: 10 } ]
    ] ) );

    const result = await calculateLLMCallCost( {
      providerId: 'openai',
      modelId: 'no-cache',
      usage: {
        inputTokens: 1_000_000,
        inputTokenDetails: {
          noCacheTokens: 800_000,
          cacheReadTokens: 150_000,
          cacheWriteTokens: 50_000
        },
        outputTokens: 0
      }
    } );

    expectLLMUsage( result, {
      modelId: 'no-cache',
      usage: [
        { type: 'input', ppm: 2, amount: 800_000, total: 1.6 },
        { type: 'input_cache_read', ppm: 2, amount: 150_000, total: 0.3 },
        { type: 'input_cache_write', ppm: 2, amount: 50_000, total: 0.1 },
        { type: 'output', ppm: 10, amount: 0, total: 0 }
      ],
      total: 2,
      tokensUsed: 1_000_000
    } );
  } );

  it( 'uses total input tokens when the cache breakdown is unavailable', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricingMap( [
      [ 'openai', 'partial-cache', { input: 2, cache_read: 1, output: 10 } ]
    ] ) );

    const result = await calculateLLMCallCost( {
      providerId: 'openai',
      modelId: 'partial-cache',
      usage: {
        inputTokens: 1_000_000,
        inputTokenDetails: { cacheReadTokens: 200_000 },
        outputTokens: 0
      }
    } );

    expectLLMUsage( result, {
      modelId: 'partial-cache',
      usage: [
        { type: 'input', ppm: 2, amount: 1_000_000, total: 2 },
        { type: 'output', ppm: 10, amount: 0, total: 0 }
      ],
      total: 2,
      tokensUsed: 1_000_000
    } );
  } );

  it( 'omits input usage when pricing has no input rate', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricingMap( [
      [ 'openai', 'out-only', { output: 10 } ]
    ] ) );

    const result = await calculateLLMCallCost( {
      providerId: 'openai',
      modelId: 'out-only',
      usage: { inputTokens: 100, outputTokens: 50 }
    } );

    expectLLMUsage( result, {
      modelId: 'out-only',
      usage: [
        { type: 'output', ppm: 10, amount: 50, total: 0.0005 }
      ],
      total: 0.0005,
      tokensUsed: 50
    } );
  } );

  it( 'omits output usage when pricing has no output rate', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricingMap( [
      [ 'openai', 'in-only', { input: 1 } ]
    ] ) );

    const result = await calculateLLMCallCost( {
      providerId: 'openai',
      modelId: 'in-only',
      usage: { inputTokens: 100, outputTokens: 50 }
    } );

    expectLLMUsage( result, {
      modelId: 'in-only',
      usage: [
        { type: 'input', ppm: 1, amount: 100, total: 0.0001 }
      ],
      total: 0.0001,
      tokensUsed: 100
    } );
  } );

  it( 'prices text and reasoning output at their respective rates', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricingMap( [
      [ 'openai', 'with-reasoning', { input: 1, output: 10, reasoning: 60 } ]
    ] ) );

    const result = await calculateLLMCallCost( {
      providerId: 'openai',
      modelId: 'with-reasoning',
      usage: {
        inputTokens: 100,
        outputTokens: 70,
        outputTokenDetails: { textTokens: 20, reasoningTokens: 50 }
      }
    } );

    expectLLMUsage( result, {
      modelId: 'with-reasoning',
      usage: [
        { type: 'input', ppm: 1, amount: 100, total: 0.0001 },
        { type: 'output', ppm: 10, amount: 20, total: 0.0002 },
        { type: 'output_reasoning', ppm: 60, amount: 50, total: 0.003 }
      ],
      total: 0.0033,
      tokensUsed: 170
    } );
  } );

  it( 'uses total output tokens when the output breakdown does not reconcile', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricingMap( [
      [ 'openai', 'partial-reasoning', { input: 1, output: 10, reasoning: 60 } ]
    ] ) );

    const result = await calculateLLMCallCost( {
      providerId: 'openai',
      modelId: 'partial-reasoning',
      usage: {
        inputTokens: 100,
        outputTokens: 100,
        outputTokenDetails: { textTokens: 20, reasoningTokens: undefined }
      }
    } );

    expectLLMUsage( result, {
      modelId: 'partial-reasoning',
      usage: [
        { type: 'input', ppm: 1, amount: 100, total: 0.0001 },
        { type: 'output', ppm: 10, amount: 100, total: 0.001 }
      ],
      total: 0.0011,
      tokensUsed: 200
    } );
  } );

  it( 'falls back to the output rate when reasoning pricing is missing', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricingMap( [
      [ 'openai', 'no-reasoning', { input: 1, output: 10 } ]
    ] ) );

    const result = await calculateLLMCallCost( {
      providerId: 'openai',
      modelId: 'no-reasoning',
      usage: {
        inputTokens: 100,
        outputTokens: 70,
        outputTokenDetails: { textTokens: 20, reasoningTokens: 50 }
      }
    } );

    expectLLMUsage( result, {
      modelId: 'no-reasoning',
      usage: [
        { type: 'input', ppm: 1, amount: 100, total: 0.0001 },
        { type: 'output', ppm: 10, amount: 20, total: 0.0002 },
        { type: 'output_reasoning', ppm: 10, amount: 50, total: 0.0005 }
      ],
      total: 0.0008,
      tokensUsed: 170
    } );
  } );

  it( 'includes reasoning usage with zero amount when reasoningTokens is zero', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricingMap( [
      [ 'openai', 'full', { input: 2, output: 8, reasoning: 60 } ]
    ] ) );

    const result = await calculateLLMCallCost( {
      providerId: 'openai',
      modelId: 'full',
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        outputTokenDetails: { textTokens: 50, reasoningTokens: 0 }
      }
    } );

    expectLLMUsage( result, {
      modelId: 'full',
      usage: [
        { type: 'input', ppm: 2, amount: 100, total: 0.0002 },
        { type: 'output', ppm: 8, amount: 50, total: 0.0004 },
        { type: 'output_reasoning', ppm: 60, amount: 0, total: 0 }
      ],
      total: 0.0006,
      tokensUsed: 150
    } );
  } );

  it( 'returns null when token counts are unavailable', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricingMap( [
      [ 'openai', 'm', { input: 1, output: 2 } ]
    ] ) );

    const result = await calculateLLMCallCost( {
      providerId: 'openai',
      modelId: 'm',
      usage: { inputTokens: null, outputTokens: undefined }
    } );

    expect( result ).toBeNull();
  } );

  it( 'returns null when pricing lookup throws', async () => {
    const error = new Error( 'boom' );
    mockFetchModelsPricing.mockRejectedValue( error );

    const result = await calculateLLMCallCost( {
      providerId: 'openai',
      modelId: 'gpt-4o',
      usage: { inputTokens: 100, outputTokens: 50 }
    } );

    expect( result ).toBeNull();
  } );
} );
