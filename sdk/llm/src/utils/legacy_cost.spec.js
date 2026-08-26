import { describe, expect, it } from 'vitest';
import { LLMCost, LLMCostItem } from './cost.js';
import { LLMUsage } from './usage.js';
import { toLegacyLLMUsageEvent } from './legacy_cost.js';

const MODEL_ID = 'test-model';
const PROVIDER_ID = 'test-provider';
const INPUT = 'input';
const OUTPUT = 'output';

const item = ( group, label, amount, ppm, total, status = LLMCostItem.Status.OK ) =>
  new LLMCostItem( group, label, amount, ppm, total, status );

const cost = items => new LLMCost(
  MODEL_ID,
  PROVIDER_ID,
  items,
  LLMUsage.Status.COMPLETE
);

describe( 'toLegacyLLMUsageEvent', () => {
  it( 'maps every detailed cost item to the legacy payload', () => {
    const result = toLegacyLLMUsageEvent( cost( [
      item( INPUT, 'no_cache', 500_000, 4, 2 ),
      item( INPUT, 'cache_read', 400_000, 1, 0.4 ),
      item( INPUT, 'cache_write', 100_000, 5, 0.5 ),
      item( OUTPUT, 'text', 200_000, 10, 2 ),
      item( OUTPUT, 'reasoning', 50_000, 20, 1 )
    ] ) );

    expect( result ).toEqual( {
      type: 'llm:usage',
      modelId: MODEL_ID,
      usage: [
        { type: 'input', ppm: 4, amount: 600_000, total: 2.4 },
        { type: 'input_cached', ppm: 1, amount: 400_000, total: 0.4 },
        { type: 'output', ppm: 10, amount: 200_000, total: 2 },
        { type: 'reasoning', ppm: 20, amount: 50_000, total: 1 }
      ],
      total: 5.8,
      tokensUsed: 1_250_000
    } );
  } );

  it( 'maps unlabeled aggregate items to input and output', () => {
    const result = toLegacyLLMUsageEvent( cost( [
      item( INPUT, null, 100, 2, 0.0002 ),
      item( OUTPUT, null, 50, 10, 0.0005 )
    ] ) );

    expect( result ).toEqual( {
      type: 'llm:usage',
      modelId: MODEL_ID,
      usage: [
        { type: 'input', ppm: 2, amount: 100, total: 0.0002 },
        { type: 'output', ppm: 10, amount: 50, total: 0.0005 }
      ],
      total: 0.0007,
      tokensUsed: 150
    } );
  } );

  it( 'omits items without a calculated price', () => {
    const result = toLegacyLLMUsageEvent( cost( [
      item( INPUT, null, 100, 2, 0.0002 ),
      item( OUTPUT, null, 50, null, null, LLMCostItem.Status.MISSING )
    ] ) );

    expect( result ).toEqual( {
      type: 'llm:usage',
      modelId: MODEL_ID,
      usage: [
        { type: 'input', ppm: 2, amount: 100, total: 0.0002 }
      ],
      total: 0.0002,
      tokensUsed: 100
    } );
  } );

  it( 'preserves the legacy zero-price cache fallback', () => {
    const result = toLegacyLLMUsageEvent( cost( [
      item( INPUT, 'no_cache', 800_000, 2, 1.6 ),
      item( INPUT, 'cache_read', 200_000, 2, 0.4, LLMCostItem.Status.FALLBACK ),
      item( OUTPUT, 'text', 0, 10, 0 )
    ] ) );

    expect( result ).toEqual( {
      type: 'llm:usage',
      modelId: MODEL_ID,
      usage: [
        { type: 'input', ppm: 2, amount: 800_000, total: 1.6 },
        { type: 'input_cached', ppm: 0, amount: 200_000, total: 0 },
        { type: 'output', ppm: 10, amount: 0, total: 0 }
      ],
      total: 1.6,
      tokensUsed: 1_000_000
    } );
  } );

  it( 'keeps reported cache reads visible when no input price exists', () => {
    const result = toLegacyLLMUsageEvent( cost( [
      item( INPUT, 'cache_read', 200, null, null, LLMCostItem.Status.MISSING ),
      item( OUTPUT, null, 50, 10, 0.0005 )
    ] ) );

    expect( result ).toEqual( {
      type: 'llm:usage',
      modelId: MODEL_ID,
      usage: [
        { type: 'input_cached', ppm: 0, amount: 200, total: 0 },
        { type: 'output', ppm: 10, amount: 50, total: 0.0005 }
      ],
      total: 0.0005,
      tokensUsed: 250
    } );
  } );

  it( 'omits reasoning that fell back to the output price', () => {
    const result = toLegacyLLMUsageEvent( cost( [
      item( INPUT, null, 100, 1, 0.0001 ),
      item( OUTPUT, 'text', 20, 10, 0.0002 ),
      item( OUTPUT, 'reasoning', 50, 10, 0.0005, LLMCostItem.Status.FALLBACK )
    ] ) );

    expect( result ).toEqual( {
      type: 'llm:usage',
      modelId: MODEL_ID,
      usage: [
        { type: 'input', ppm: 1, amount: 100, total: 0.0001 },
        { type: 'output', ppm: 10, amount: 20, total: 0.0002 }
      ],
      total: 0.0003,
      tokensUsed: 120
    } );
  } );

  it( 'folds cache writes using the input fallback into input usage', () => {
    const result = toLegacyLLMUsageEvent( cost( [
      item( INPUT, 'no_cache', 800_000, 2, 1.6 ),
      item( INPUT, 'cache_write', 200_000, 2, 0.4, LLMCostItem.Status.FALLBACK )
    ] ) );

    expect( result.usage ).toEqual( [
      { type: 'input', ppm: 2, amount: 1_000_000, total: 2 }
    ] );
    expect( result.total ).toBe( 2 );
    expect( result.tokensUsed ).toBe( 1_000_000 );
  } );

  it( 'returns null when no legacy-priced cost is available', () => {
    const result = toLegacyLLMUsageEvent( cost( [
      item( INPUT, null, 100, null, null, LLMCostItem.Status.MISSING ),
      item( OUTPUT, null, 50, null, null, LLMCostItem.Status.MISSING )
    ] ) );

    expect( result ).toBeNull();
  } );

  it( 'preserves zero-valued prices and totals', () => {
    const result = toLegacyLLMUsageEvent( cost( [
      item( INPUT, 'cache_read', 20, 0, 0 ),
      item( OUTPUT, 'reasoning', 0, 0, 0 )
    ] ) );

    expect( result.usage ).toEqual( [
      { type: 'input_cached', ppm: 0, amount: 20, total: 0 },
      { type: 'reasoning', ppm: 0, amount: 0, total: 0 }
    ] );
    expect( result.total ).toBe( 0 );
    expect( result.tokensUsed ).toBe( 20 );
  } );

  it( 'omits labels that did not exist in the legacy payload', () => {
    const result = toLegacyLLMUsageEvent( cost( [
      item( INPUT, 'no_cache', 20, 2, 0.00004 ),
      item( INPUT, 'future_cache', 10, 3, 0.00003 ),
      item( OUTPUT, 'future_output', 5, 4, 0.00002 )
    ] ) );

    expect( result.usage ).toEqual( [
      { type: 'input', ppm: 2, amount: 20, total: 0.00004 }
    ] );
  } );

  it( 'returns null when no item can be represented by the legacy payload', () => {
    const result = toLegacyLLMUsageEvent( cost( [
      item( INPUT, 'future_cache', 10, 3, 0.00003 ),
      item( OUTPUT, 'future_output', 5, 4, 0.00002 )
    ] ) );

    expect( result ).toBeNull();
  } );
} );
