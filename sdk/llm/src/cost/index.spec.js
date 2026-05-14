import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetchModelsPricing = vi.fn();
vi.mock( './fetch_models_pricing.js', () => ( {
  fetchModelsPricing: ( ...args ) => mockFetchModelsPricing( ...args )
} ) );

import { calculateLLMCallCost } from './index.js';

const expectCostInfo = ( result, modelId, tokens = undefined ) => {
  expect( result.info ).toEqual( { modelId, tokens } );
};

describe( 'calculateLLMCallCost', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'returns total null and message when fetchModelsPricing returns null', async () => {
    mockFetchModelsPricing.mockResolvedValue( null );

    const result = await calculateLLMCallCost( {
      modelId: 'gpt-4o',
      usage: { inputTokens: 100, outputTokens: 50 }
    } );

    expect( result ).toEqual( { total: null, message: 'Failed to fetch models pricing' } );
  } );

  it( 'returns total null and message when model is missing from cost table', async () => {
    mockFetchModelsPricing.mockResolvedValue( new Map() );

    const result = await calculateLLMCallCost( {
      modelId: 'unknown-model',
      usage: { inputTokens: 100, outputTokens: 50 }
    } );

    expect( result ).toEqual( {
      total: null,
      message: 'Missing cost reference for model'
    } );
  } );

  it( 'calculates input and output cost from mock model', async () => {
    const cost = { input: 2, output: 10, cache_read: 1 };
    mockFetchModelsPricing.mockResolvedValue( new Map( [ [ 'gpt-4o', cost ] ] ) );

    const result = await calculateLLMCallCost( {
      modelId: 'gpt-4o',
      usage: { inputTokens: 1_000_000, outputTokens: 500_000 }
    } );

    expect( result.total ).toBe( 7 );
    expect( result.components ).toEqual( [
      { name: 'input_tokens', value: 2, tokens: 1_000_000 },
      { name: 'input_cached_tokens', value: 0, tokens: undefined },
      { name: 'output_tokens', value: 5, tokens: 500_000 }
    ] );
    expectCostInfo( result, 'gpt-4o' );
  } );

  it( 'splits input into non-cached and cached at respective rates', async () => {
    const cost = { input: 4, cache_read: 1, output: 10 };
    mockFetchModelsPricing.mockResolvedValue( new Map( [ [ 'cached-model', cost ] ] ) );

    const result = await calculateLLMCallCost( {
      modelId: 'cached-model',
      usage: { inputTokens: 1_000_000, cachedInputTokens: 500_000, outputTokens: 100_000 }
    } );

    expect( result.components ).toEqual( [
      { name: 'input_tokens', value: 2, tokens: 500_000 },
      { name: 'input_cached_tokens', value: 0.5, tokens: 500_000 },
      { name: 'output_tokens', value: 1, tokens: 100_000 }
    ] );
    expect( result.total ).toBeCloseTo( 3.5 );
    expectCostInfo( result, 'cached-model' );
  } );

  it( 'omits cached component when model has no cache_read (non-cached rate applies to full input minus cached)', async () => {
    mockFetchModelsPricing.mockResolvedValue( new Map( [ [ 'no-cache', { input: 2, output: 10 } ] ] ) );

    const result = await calculateLLMCallCost( {
      modelId: 'no-cache',
      usage: { inputTokens: 1_000_000, cachedInputTokens: 200_000, outputTokens: 0 }
    } );

    expect( result.components ).toEqual( [
      { name: 'input_tokens', value: 1.6, tokens: 800_000 },
      { name: 'output_tokens', value: 0, tokens: 0 }
    ] );
    expect( result.total ).toBe( 1.6 );
    expectCostInfo( result, 'no-cache' );
  } );

  it( 'omits input component when pricing has no input rate', async () => {
    mockFetchModelsPricing.mockResolvedValue( new Map( [ [ 'out-only', { output: 10 } ] ] ) );

    const result = await calculateLLMCallCost( {
      modelId: 'out-only',
      usage: { inputTokens: 100, outputTokens: 50 }
    } );

    expect( result.total ).toBe( 0.0005 );
    expect( result.components ).toEqual( [
      { name: 'output_tokens', value: 0.0005, tokens: 50 }
    ] );
    expectCostInfo( result, 'out-only' );
  } );

  it( 'omits output component when pricing has no output rate', async () => {
    mockFetchModelsPricing.mockResolvedValue( new Map( [ [ 'in-only', { input: 1 } ] ] ) );

    const result = await calculateLLMCallCost( {
      modelId: 'in-only',
      usage: { inputTokens: 100, outputTokens: 50 }
    } );

    expect( result.total ).toBe( 0.0001 );
    expect( result.components ).toEqual( [
      { name: 'input_tokens', value: 0.0001, tokens: 100 }
    ] );
    expectCostInfo( result, 'in-only' );
  } );

  it( 'uses reasoning cost when present', async () => {
    mockFetchModelsPricing.mockResolvedValue( new Map( [ [
      'with-reasoning',
      { input: 1, output: 10, reasoning: 60 }
    ] ] ) );

    const result = await calculateLLMCallCost( {
      modelId: 'with-reasoning',
      usage: { inputTokens: 100, outputTokens: 20, reasoningTokens: 50 }
    } );

    expect( result.total ).toBeCloseTo( 0.0033 );
    expect( result.components ).toEqual( [
      { name: 'input_tokens', value: 0.0001, tokens: 100 },
      { name: 'output_tokens', value: 0.0002, tokens: 20 },
      { name: 'reasoning_tokens', value: 0.003, tokens: 50 }
    ] );
    expectCostInfo( result, 'with-reasoning' );
  } );

  it( 'omits reasoning component when reasoning cost missing (included in output)', async () => {
    mockFetchModelsPricing.mockResolvedValue( new Map( [ [ 'no-reasoning', { input: 1, output: 10 } ] ] ) );

    const result = await calculateLLMCallCost( {
      modelId: 'no-reasoning',
      usage: { inputTokens: 100, outputTokens: 20, reasoningTokens: 50 }
    } );

    expect( result.total ).toBeCloseTo( 0.0003 );
    expect( result.components ).toEqual( [
      { name: 'input_tokens', value: 0.0001, tokens: 100 },
      { name: 'output_tokens', value: 0.0002, tokens: 20 }
    ] );
    expectCostInfo( result, 'no-reasoning' );
  } );

  it( 'includes reasoning component with zero when reasoningTokens is zero', async () => {
    mockFetchModelsPricing.mockResolvedValue( new Map( [ [
      'full',
      { input: 2, output: 8, reasoning: 60 }
    ] ] ) );

    const result = await calculateLLMCallCost( {
      modelId: 'full',
      usage: { inputTokens: 100, outputTokens: 50, reasoningTokens: 0 }
    } );

    expect( result.components ).toEqual( [
      { name: 'input_tokens', value: 0.0002, tokens: 100 },
      { name: 'output_tokens', value: 0.0004, tokens: 50 },
      { name: 'reasoning_tokens', value: 0, tokens: 0 }
    ] );
    expect( result.total ).toBeCloseTo( 0.0006 );
    expectCostInfo( result, 'full' );
  } );

  it( 'treats null/undefined token counts as 0', async () => {
    mockFetchModelsPricing.mockResolvedValue( new Map( [ [ 'm', { input: 1, output: 2 } ] ] ) );

    const result = await calculateLLMCallCost( {
      modelId: 'm',
      usage: { inputTokens: null, outputTokens: undefined }
    } );

    expect( result.total ).toBe( 0 );
    expect( result.components ).toEqual( [
      { name: 'input_tokens', value: 0, tokens: 0 },
      { name: 'output_tokens', value: 0, tokens: undefined }
    ] );
    expectCostInfo( result, 'm' );
  } );
} );
