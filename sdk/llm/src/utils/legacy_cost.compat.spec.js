import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateCosts } from './cost.js';
import { toLegacyLLMUsageEvent } from './legacy_cost.js';
import { parseLLMUsage } from './usage.js';

const mockFetchModelsPricing = vi.hoisted( () => vi.fn() );

vi.mock( './models_pricing.js', () => ( {
  fetchModelsPricing: ( ...args ) => mockFetchModelsPricing( ...args )
} ) );

const pricingMap = entries => new Map( entries.map( ( [ providerId, modelId, cost ] ) => [
  `${providerId}/${modelId}`,
  cost
] ) );

const calculateLegacyCost = async ( { providerId, modelId, usage } ) => {
  const normalized = parseLLMUsage( {
    prompt: { config: { provider: providerId, model: modelId } },
    usage
  } );
  if ( !normalized ) {
    return null;
  }

  const cost = await calculateCosts( normalized );
  return cost ? toLegacyLLMUsageEvent( cost ) : null;
};

const expectLLMUsage = ( result, { modelId, usage, total, tokensUsed } ) => {
  expect( result ).toEqual( {
    type: 'llm:usage',
    modelId,
    usage,
    total,
    tokensUsed
  } );
};

/**
 * Adapted from the original cost/index.spec.js on main.
 *
 * AI SDK v6 cached/reasoning inputs are represented with their v7 detail
 * fields. Legacy payload expectations remain unchanged.
 */
describe( 'legacy cost compatibility', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'returns null when fetchModelsPricing returns null', async () => {
    mockFetchModelsPricing.mockResolvedValue( null );

    const result = await calculateLegacyCost( {
      providerId: 'openai',
      modelId: 'gpt-4o',
      usage: { inputTokens: 100, outputTokens: 50 }
    } );

    expect( result ).toBeNull();
  } );

  it( 'returns null when model is missing from cost table', async () => {
    mockFetchModelsPricing.mockResolvedValue( new Map() );

    const result = await calculateLegacyCost( {
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

    const result = await calculateLegacyCost( {
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

    const openai = await calculateLegacyCost( {
      providerId: 'openai',
      modelId: 'gpt-4o',
      usage
    } );
    const azure = await calculateLegacyCost( {
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

  it( 'splits input into non-cached and cached usage at respective rates', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricingMap( [
      [ 'openai', 'cached-model', { input: 4, cache_read: 1, output: 10 } ]
    ] ) );

    const result = await calculateLegacyCost( {
      providerId: 'openai',
      modelId: 'cached-model',
      usage: {
        inputTokens: 1_000_000,
        inputTokenDetails: {
          noCacheTokens: 500_000,
          cacheReadTokens: 500_000
        },
        outputTokens: 100_000
      }
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

  it( 'folds cache writes into legacy input usage at the input rate', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricingMap( [
      [ 'openai', 'cache-write-model', { input: 4, cache_read: 1, cache_write: 5, output: 10 } ]
    ] ) );

    const result = await calculateLegacyCost( {
      providerId: 'openai',
      modelId: 'cache-write-model',
      usage: {
        inputTokens: 1_000_000,
        inputTokenDetails: {
          noCacheTokens: 500_000,
          cacheReadTokens: 400_000,
          cacheWriteTokens: 100_000
        },
        outputTokens: 0
      }
    } );

    expectLLMUsage( result, {
      modelId: 'cache-write-model',
      usage: [
        { type: 'input', ppm: 4, amount: 600_000, total: 2.4 },
        { type: 'input_cached', ppm: 1, amount: 400_000, total: 0.4 },
        { type: 'output', ppm: 10, amount: 0, total: 0 }
      ],
      total: 2.8,
      tokensUsed: 1_000_000
    } );
  } );

  it( 'still counts cached tokens when the model has no cache_read rate', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricingMap( [
      [ 'openai', 'no-cache', { input: 2, output: 10 } ]
    ] ) );

    const result = await calculateLegacyCost( {
      providerId: 'openai',
      modelId: 'no-cache',
      usage: {
        inputTokens: 1_000_000,
        inputTokenDetails: {
          noCacheTokens: 800_000,
          cacheReadTokens: 200_000
        },
        outputTokens: 0
      }
    } );

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
    mockFetchModelsPricing.mockResolvedValue( pricingMap( [
      [ 'openai', 'out-only', { output: 10 } ]
    ] ) );

    const result = await calculateLegacyCost( {
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

    const result = await calculateLegacyCost( {
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

  it( 'includes reasoning usage when present', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricingMap( [
      [ 'openai', 'with-reasoning', { input: 1, output: 10, reasoning: 60 } ]
    ] ) );

    const result = await calculateLegacyCost( {
      providerId: 'openai',
      modelId: 'with-reasoning',
      usage: {
        inputTokens: 100,
        outputTokens: 70,
        outputTokenDetails: {
          textTokens: 20,
          reasoningTokens: 50
        }
      }
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
    mockFetchModelsPricing.mockResolvedValue( pricingMap( [
      [ 'openai', 'no-reasoning', { input: 1, output: 10 } ]
    ] ) );

    const result = await calculateLegacyCost( {
      providerId: 'openai',
      modelId: 'no-reasoning',
      usage: {
        inputTokens: 100,
        outputTokens: 70,
        outputTokenDetails: {
          textTokens: 20,
          reasoningTokens: 50
        }
      }
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
    mockFetchModelsPricing.mockResolvedValue( pricingMap( [
      [ 'openai', 'full', { input: 2, output: 8, reasoning: 60 } ]
    ] ) );

    const result = await calculateLegacyCost( {
      providerId: 'openai',
      modelId: 'full',
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        outputTokenDetails: {
          textTokens: 50,
          reasoningTokens: 0
        }
      }
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

  it( 'preserves zero input usage when output usage is unavailable', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricingMap( [
      [ 'openai', 'm', { input: 1, output: 2 } ]
    ] ) );

    const result = await calculateLegacyCost( {
      providerId: 'openai',
      modelId: 'm',
      usage: { inputTokens: 0, outputTokens: undefined }
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
} );
