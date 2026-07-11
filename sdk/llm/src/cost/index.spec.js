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

    addUsage( { type, ppm, amount, unit = 'token' } ) {
      this.usage.push( {
        type,
        ppm,
        amount,
        total: ( amount / 1_000_000 ) * ppm,
        ...( unit === 'token' ? {} : { unit } )
      } );
    }

    get total() {
      return this.usage.reduce( ( total, current ) => total + current.total, 0 );
    }

    get tokensUsed() {
      return this.usage
        .filter( current => !current.unit || current.unit === 'token' )
        .reduce( ( total, current ) => total + current.amount, 0 );
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
      modelId: 'gpt-4o',
      usage: { inputTokens: 100, outputTokens: 50 }
    } );

    expect( result ).toBeNull();
  } );

  it( 'returns null when model is missing from cost table', async () => {
    mockFetchModelsPricing.mockResolvedValue( new Map() );

    const result = await calculateLLMCallCost( {
      modelId: 'unknown-model',
      usage: { inputTokens: 100, outputTokens: 50 }
    } );

    expect( result ).toBeNull();
  } );

  it( 'calculates input and output usage from model pricing', async () => {
    mockFetchModelsPricing.mockResolvedValue( new Map( [ [ 'gpt-4o', { input: 2, output: 10, cache_read: 1 } ] ] ) );

    const result = await calculateLLMCallCost( {
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

  it( 'includes Gemini 3 search grounding cost without counting queries as tokens', async () => {
    mockFetchModelsPricing.mockResolvedValue( new Map( [ [
      'gemini-3.5-flash',
      { input: 1.5, output: 9 }
    ] ] ) );

    const result = await calculateLLMCallCost( {
      modelId: 'gemini-3.5-flash',
      usage: { inputTokens: 1_000, outputTokens: 100 },
      providerMetadata: {
        vertex: { groundingMetadata: { webSearchQueries: [ 'one', 'two' ] } }
      }
    } );

    expectLLMUsage( result, {
      modelId: 'gemini-3.5-flash',
      usage: [
        { type: 'input', ppm: 1.5, amount: 1_000, total: 0.0015 },
        { type: 'output', ppm: 9, amount: 100, total: ( 100 / 1_000_000 ) * 9 },
        {
          type: 'google_search_grounding',
          unit: 'query',
          ppm: 14_000,
          amount: 2,
          total: ( 2 / 1_000_000 ) * 14_000
        }
      ],
      total: 0.0304,
      tokensUsed: 1_100
    } );
  } );

  it( 'splits input into non-cached and cached usage at respective rates', async () => {
    mockFetchModelsPricing.mockResolvedValue( new Map( [ [ 'cached-model', { input: 4, cache_read: 1, output: 10 } ] ] ) );

    const result = await calculateLLMCallCost( {
      modelId: 'cached-model',
      usage: { inputTokens: 1_000_000, cachedInputTokens: 500_000, outputTokens: 100_000 }
    } );

    expectLLMUsage( result, {
      modelId: 'cached-model',
      usage: [
        { type: 'input', ppm: 4, amount: 500_000, total: 2 },
        { type: 'input_cached', ppm: 1, amount: 500_000, total: 0.5 },
        { type: 'output', ppm: 10, amount: 100_000, total: 1 }
      ],
      total: 3.5,
      tokensUsed: 1_100_000
    } );
  } );

  it( 'still counts cached tokens when the model has no cache_read rate', async () => {
    mockFetchModelsPricing.mockResolvedValue( new Map( [ [ 'no-cache', { input: 2, output: 10 } ] ] ) );

    const result = await calculateLLMCallCost( {
      modelId: 'no-cache',
      usage: { inputTokens: 1_000_000, cachedInputTokens: 200_000, outputTokens: 0 }
    } );

    // Cached tokens are surfaced (priced at 0 without a cache_read rate) so caching is
    // visible in the aggregation; cost is unchanged since they are excluded from `input`.
    expectLLMUsage( result, {
      modelId: 'no-cache',
      usage: [
        { type: 'input', ppm: 2, amount: 800_000, total: 1.6 },
        { type: 'input_cached', ppm: 0, amount: 200_000, total: 0 },
        { type: 'output', ppm: 10, amount: 0, total: 0 }
      ],
      total: 1.6,
      tokensUsed: 1_000_000
    } );
  } );

  it( 'omits input usage when pricing has no input rate', async () => {
    mockFetchModelsPricing.mockResolvedValue( new Map( [ [ 'out-only', { output: 10 } ] ] ) );

    const result = await calculateLLMCallCost( {
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
    mockFetchModelsPricing.mockResolvedValue( new Map( [ [ 'in-only', { input: 1 } ] ] ) );

    const result = await calculateLLMCallCost( {
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

  it( 'includes reasoning usage when present', async () => {
    mockFetchModelsPricing.mockResolvedValue( new Map( [ [
      'with-reasoning',
      { input: 1, output: 10, reasoning: 60 }
    ] ] ) );

    const result = await calculateLLMCallCost( {
      modelId: 'with-reasoning',
      usage: { inputTokens: 100, outputTokens: 20, reasoningTokens: 50 }
    } );

    expectLLMUsage( result, {
      modelId: 'with-reasoning',
      usage: [
        { type: 'input', ppm: 1, amount: 100, total: 0.0001 },
        { type: 'output', ppm: 10, amount: 20, total: 0.0002 },
        { type: 'reasoning', ppm: 60, amount: 50, total: 0.003 }
      ],
      total: 0.0033,
      tokensUsed: 170
    } );
  } );

  it( 'omits reasoning usage when reasoning cost is missing', async () => {
    mockFetchModelsPricing.mockResolvedValue( new Map( [ [ 'no-reasoning', { input: 1, output: 10 } ] ] ) );

    const result = await calculateLLMCallCost( {
      modelId: 'no-reasoning',
      usage: { inputTokens: 100, outputTokens: 20, reasoningTokens: 50 }
    } );

    expectLLMUsage( result, {
      modelId: 'no-reasoning',
      usage: [
        { type: 'input', ppm: 1, amount: 100, total: 0.0001 },
        { type: 'output', ppm: 10, amount: 20, total: 0.0002 }
      ],
      total: 0.0003,
      tokensUsed: 120
    } );
  } );

  it( 'includes reasoning usage with zero amount when reasoningTokens is zero', async () => {
    mockFetchModelsPricing.mockResolvedValue( new Map( [ [
      'full',
      { input: 2, output: 8, reasoning: 60 }
    ] ] ) );

    const result = await calculateLLMCallCost( {
      modelId: 'full',
      usage: { inputTokens: 100, outputTokens: 50, reasoningTokens: 0 }
    } );

    expectLLMUsage( result, {
      modelId: 'full',
      usage: [
        { type: 'input', ppm: 2, amount: 100, total: 0.0002 },
        { type: 'output', ppm: 8, amount: 50, total: 0.0004 },
        { type: 'reasoning', ppm: 60, amount: 0, total: 0 }
      ],
      total: 0.0006,
      tokensUsed: 150
    } );
  } );

  it( 'omits usage entries for non-finite token counts', async () => {
    mockFetchModelsPricing.mockResolvedValue( new Map( [ [ 'm', { input: 1, output: 2 } ] ] ) );

    const result = await calculateLLMCallCost( {
      modelId: 'm',
      usage: { inputTokens: null, outputTokens: undefined }
    } );

    expectLLMUsage( result, {
      modelId: 'm',
      usage: [
        { type: 'input', ppm: 1, amount: 0, total: 0 }
      ],
      total: 0,
      tokensUsed: 0
    } );
  } );

  it( 'returns null when pricing lookup throws', async () => {
    const error = new Error( 'boom' );
    mockFetchModelsPricing.mockRejectedValue( error );

    const result = await calculateLLMCallCost( {
      modelId: 'gpt-4o',
      usage: { inputTokens: 100, outputTokens: 50 }
    } );

    expect( result ).toBeNull();
  } );
} );
