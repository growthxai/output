import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetchModelsPricing = vi.fn();
vi.mock( './fetch_models_pricing.js', () => ( {
  fetchModelsPricing: ( ...args ) => mockFetchModelsPricing( ...args )
} ) );

import { calculateLLMCallCost } from './index.js';

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
    expect( result.components.input ).toEqual( { value: 2 } );
    expect( result.components.cachedInput ).toEqual( { value: 0 } );
    expect( result.components.output ).toEqual( { value: 5 } );
    expect( result.components.reasoning ).toBeUndefined();
  } );

  it( 'splits input into non-cached and cached at respective rates', async () => {
    const cost = { input: 4, cache_read: 1, output: 10 };
    mockFetchModelsPricing.mockResolvedValue( new Map( [ [ 'cached-model', cost ] ] ) );

    const result = await calculateLLMCallCost( {
      modelId: 'cached-model',
      usage: { inputTokens: 1_000_000, cachedInputTokens: 500_000, outputTokens: 100_000 }
    } );

    expect( result.components.input ).toEqual( { value: 2 } );
    expect( result.components.cachedInput ).toEqual( { value: 0.5 } );
    expect( result.components.output ).toEqual( { value: 1 } );
    expect( result.total ).toBeCloseTo( 3.5 );
  } );

  it( 'sets cachedInput to null when model has no cache_read', async () => {
    mockFetchModelsPricing.mockResolvedValue( new Map( [ [ 'no-cache', { input: 2, output: 10 } ] ] ) );

    const result = await calculateLLMCallCost( {
      modelId: 'no-cache',
      usage: { inputTokens: 1_000_000, cachedInputTokens: 200_000, outputTokens: 0 }
    } );

    expect( result.components.input ).toEqual( { value: 1.6 } );
    expect( result.components.cachedInput ).toEqual( { value: null, message: 'Missing cache input cost' } );
    expect( result.total ).toBe( 1.6 );
  } );

  it( 'sets input to null and message when pricing has no input', async () => {
    mockFetchModelsPricing.mockResolvedValue( new Map( [ [ 'out-only', { output: 10 } ] ] ) );

    const result = await calculateLLMCallCost( {
      modelId: 'out-only',
      usage: { inputTokens: 100, outputTokens: 50 }
    } );

    expect( result.total ).toBe( 0.0005 );
    expect( result.components.input ).toEqual( { value: null, message: 'Missing input cost' } );
    expect( result.components.output ).toEqual( { value: 0.0005 } );
  } );

  it( 'sets output to null and message when pricing has no output', async () => {
    mockFetchModelsPricing.mockResolvedValue( new Map( [ [ 'in-only', { input: 1 } ] ] ) );

    const result = await calculateLLMCallCost( {
      modelId: 'in-only',
      usage: { inputTokens: 100, outputTokens: 50 }
    } );

    expect( result.total ).toBe( 0.0001 );
    expect( result.components.input ).toEqual( { value: 0.0001 } );
    expect( result.components.output ).toEqual( { value: null, message: 'Missing output' } );
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
    expect( result.components.reasoning ).toEqual( { value: 0.003 } );
  } );

  it( 'omits reasoning component when reasoning cost missing (included in output)', async () => {
    mockFetchModelsPricing.mockResolvedValue( new Map( [ [ 'no-reasoning', { input: 1, output: 10 } ] ] ) );

    const result = await calculateLLMCallCost( {
      modelId: 'no-reasoning',
      usage: { inputTokens: 100, outputTokens: 20, reasoningTokens: 50 }
    } );

    expect( result.total ).toBeCloseTo( 0.0003 );
    expect( result.components.reasoning ).toBeUndefined();
  } );

  it( 'Calculate reasoning component when reasoningTokens is zero', async () => {
    mockFetchModelsPricing.mockResolvedValue( new Map( [ [
      'full',
      { input: 2, output: 8, reasoning: 60 }
    ] ] ) );

    const result = await calculateLLMCallCost( {
      modelId: 'full',
      usage: { inputTokens: 100, outputTokens: 50, reasoningTokens: 0 }
    } );

    expect( result.components.reasoning ).toEqual( { value: 0 } );
    expect( result.total ).toBeCloseTo( 0.0006 );
  } );

  it( 'treats null/undefined token counts as 0', async () => {
    mockFetchModelsPricing.mockResolvedValue( new Map( [ [ 'm', { input: 1, output: 2 } ] ] ) );

    const result = await calculateLLMCallCost( {
      modelId: 'm',
      usage: { inputTokens: null, outputTokens: undefined }
    } );

    expect( result.total ).toBe( 0 );
  } );
} );
