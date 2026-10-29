import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetchModelsPricing = vi.hoisted( () => vi.fn() );

vi.mock( './models_pricing.js', async importOriginal => ( {
  ...await importOriginal(),
  fetchModelsPricing: ( ...args ) => mockFetchModelsPricing( ...args )
} ) );

import { Logger } from '#runtime_logger';
import { LLMGenerationCost, LLMGenerationCostItem, calculateCosts, calculateLegacyCosts } from './cost.js';
import { Freshness } from './models_pricing.js';
import { LLMGenerationUsage, LLMGenerationUsageItem } from './usage.js';

const INPUT = LLMGenerationUsageItem.Group.INPUT;
const OUTPUT = LLMGenerationUsageItem.Group.OUTPUT;
const TOOLS = LLMGenerationUsageItem.Group.TOOLS;
const MODEL_ID = 'test-model';
const PROVIDER_ID = 'test-provider';

const item = ( group, label, amount ) => new LLMGenerationUsageItem( group, label, amount );
const usageFor = ( providerId, modelId, items ) => new LLMGenerationUsage( modelId, providerId, items );
const usage = items => usageFor( PROVIDER_ID, MODEL_ID, items );
const table = ( models, freshness = Freshness.LIVE ) => ( { models, freshness } );
const pricing = ( cost, freshness ) =>
  table( new Map( [ [ `${PROVIDER_ID}/${MODEL_ID}`, { cost, reasoning: false } ] ] ), freshness );
const serialize = value => JSON.parse( JSON.stringify( value ) );

describe( 'calculateCosts', () => {
  beforeEach( () => {
    mockFetchModelsPricing.mockReset();
    vi.spyOn( Logger, 'warn' ).mockImplementation( () => {} );
  } );

  afterEach( () => {
    vi.restoreAllMocks();
  } );

  it( 'returns null when model pricing cannot be fetched', async () => {
    mockFetchModelsPricing.mockResolvedValue( table( null, Freshness.SNAPSHOT ) );

    const result = await calculateCosts( usage( [
      item( INPUT, null, 100 ),
      item( OUTPUT, null, 50 )
    ] ) );

    expect( result ).toBeNull();
    expect( Logger.warn ).toHaveBeenCalledWith( 'Failed to fetch models pricing', { namespace: 'LLM' } );
  } );

  it( 'calculates precise aggregate input and output costs', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricing( {
      input: 2,
      output: 10
    } ) );

    const result = await calculateCosts( usage( [
      item( INPUT, null, 1_000_000 ),
      item( OUTPUT, null, 500_000 )
    ] ) );

    expect( result ).toBeInstanceOf( LLMGenerationCost );
    expect( serialize( result ) ).toEqual( {
      type: LLMGenerationCost.TYPE,
      providerId: PROVIDER_ID,
      modelId: MODEL_ID,
      input: 2,
      output: 5,
      tools: null,
      total: 7,
      status: LLMGenerationCost.Status.PRECISE,
      pricingFreshness: Freshness.LIVE,
      items: [
        {
          group: INPUT,
          label: null,
          amount: 1_000_000,
          ppm: 2,
          total: 2,
          status: LLMGenerationCostItem.Status.OK
        },
        {
          group: OUTPUT,
          label: null,
          amount: 500_000,
          ppm: 10,
          total: 5,
          status: LLMGenerationCostItem.Status.OK
        }
      ]
    } );
  } );

  it( 'uses specialized cache and reasoning prices when available', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricing( {
      input: 4,
      cache_read: 1,
      cache_write: 5,
      output: 10,
      reasoning: 20
    } ) );

    const result = await calculateCosts( usage( [
      item( INPUT, 'no_cache', 500_000 ),
      item( INPUT, 'cache_read', 400_000 ),
      item( INPUT, 'cache_write', 100_000 ),
      item( OUTPUT, 'text', 200_000 ),
      item( OUTPUT, 'reasoning', 50_000 )
    ] ) );

    expect( result ).toMatchObject( {
      input: 2.9,
      output: 3,
      total: 5.9,
      status: LLMGenerationCost.Status.PRECISE
    } );
    expect( result.items ).toEqual( [
      new LLMGenerationCostItem( INPUT, 'no_cache', 500_000, 4, 2, LLMGenerationCostItem.Status.OK ),
      new LLMGenerationCostItem( INPUT, 'cache_read', 400_000, 1, 0.4, LLMGenerationCostItem.Status.OK ),
      new LLMGenerationCostItem( INPUT, 'cache_write', 100_000, 5, 0.5, LLMGenerationCostItem.Status.OK ),
      new LLMGenerationCostItem( OUTPUT, 'text', 200_000, 10, 2, LLMGenerationCostItem.Status.OK ),
      new LLMGenerationCostItem( OUTPUT, 'reasoning', 50_000, 20, 1, LLMGenerationCostItem.Status.OK )
    ] );
  } );

  it.each( [
    { input: 99, inputPpm: 2, outputPpm: 10, tier: undefined },
    { input: 100, inputPpm: 2, outputPpm: 10, tier: undefined },
    { input: 101, inputPpm: 4, outputPpm: 20, tier: { type: 'context', size: 100 } }
  ] )( 'selects context pricing for $input input tokens', async ( { input, inputPpm, outputPpm, tier } ) => {
    mockFetchModelsPricing.mockResolvedValue( pricing( {
      input: 2,
      output: 10,
      tiers: [
        {
          input: 4,
          output: 20,
          tier: { type: 'context', size: 100 }
        }
      ]
    } ) );

    const result = await calculateCosts( usage( [
      item( INPUT, null, input ),
      item( OUTPUT, null, 10 )
    ] ), [] );

    expect( result.items ).toEqual( [
      new LLMGenerationCostItem(
        INPUT,
        null,
        input,
        inputPpm,
        input / 1_000_000 * inputPpm,
        LLMGenerationCostItem.Status.OK,
        tier
      ),
      new LLMGenerationCostItem(
        OUTPUT,
        null,
        10,
        outputPpm,
        10 / 1_000_000 * outputPpm,
        LLMGenerationCostItem.Status.OK,
        tier
      )
    ] );
  } );

  it( 'uses specialized tier rates and falls back within the selected tier', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricing( {
      input: 2,
      cache_read: 0.2,
      cache_write: 2.5,
      output: 10,
      reasoning: 15,
      tiers: [
        {
          input: 4,
          cache_read: 0.4,
          output: 20,
          tier: { type: 'context', size: 100 }
        }
      ]
    } ) );

    const result = await calculateCosts( usage( [
      item( INPUT, 'cache_read', 60 ),
      item( INPUT, 'cache_write', 41 ),
      item( OUTPUT, null, 10 ),
      item( OUTPUT, 'reasoning', 5 )
    ] ), [] );

    expect( result.status ).toBe( LLMGenerationCost.Status.IMPRECISE );
    expect( result.items.map( value => ( { ppm: value.ppm, status: value.status, tier: value.tier } ) ) ).toEqual( [
      { ppm: 0.4, status: LLMGenerationCostItem.Status.OK, tier: { type: 'context', size: 100 } },
      { ppm: 4, status: LLMGenerationCostItem.Status.FALLBACK, tier: { type: 'context', size: 100 } },
      { ppm: 20, status: LLMGenerationCostItem.Status.OK, tier: { type: 'context', size: 100 } },
      { ppm: 20, status: LLMGenerationCostItem.Status.FALLBACK, tier: { type: 'context', size: 100 } }
    ] );
  } );

  it( 'prices multi-step usage per request and merges equal tool rates', async () => {
    const providerId = 'anthropic';
    mockFetchModelsPricing.mockResolvedValue( table( new Map( [
      [ `${providerId}/${MODEL_ID}`, {
        cost: {
          input: 2,
          output: 10,
          tiers: [
            {
              input: 4,
              output: 20,
              tier: { type: 'context', size: 100 }
            }
          ]
        },
        reasoning: false
      } ]
    ] ) ) );
    const baseUsage = usageFor( providerId, MODEL_ID, [
      item( INPUT, null, 50 ),
      item( OUTPUT, null, 10 ),
      item( TOOLS, 'web_search', 1 )
    ] );
    const tierUsage = usageFor( providerId, MODEL_ID, [
      item( INPUT, null, 101 ),
      item( OUTPUT, null, 20 ),
      item( TOOLS, 'web_search', 1 )
    ] );

    const result = await calculateCosts( usageFor( providerId, MODEL_ID, [
      item( INPUT, null, 151 ),
      item( OUTPUT, null, 30 ),
      item( TOOLS, 'web_search', 2 )
    ] ), [ baseUsage, tierUsage ] );

    expect( result.items ).toEqual( [
      new LLMGenerationCostItem( INPUT, null, 50, 2, 0.0001, LLMGenerationCostItem.Status.OK ),
      new LLMGenerationCostItem( OUTPUT, null, 10, 10, 0.0001, LLMGenerationCostItem.Status.OK ),
      new LLMGenerationCostItem( TOOLS, 'web_search', 2, 10_000, 0.02, LLMGenerationCostItem.Status.OK ),
      new LLMGenerationCostItem(
        INPUT,
        null,
        101,
        4,
        0.000404,
        LLMGenerationCostItem.Status.OK,
        { type: 'context', size: 100 }
      ),
      new LLMGenerationCostItem(
        OUTPUT,
        null,
        20,
        20,
        0.0004,
        LLMGenerationCostItem.Status.OK,
        { type: 'context', size: 100 }
      )
    ] );
    expect( result.total ).toBe( 0.021004 );
  } );

  it( 'keeps aggregate costing for multi-step models without tiers', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricing( {
      input: 2,
      cache_read: 1,
      output: 10
    } ) );
    const firstUsage = usage( [
      item( INPUT, 'no_cache', 50 ),
      item( OUTPUT, 'text', 10 )
    ] );
    const secondUsage = usage( [
      item( INPUT, 'cache_read', 101 ),
      item( OUTPUT, 'text', 20 )
    ] );

    const result = await calculateCosts( usage( [
      item( INPUT, null, 151 ),
      item( OUTPUT, null, 30 )
    ] ), [ firstUsage, secondUsage ] );

    expect( result.items ).toEqual( [
      new LLMGenerationCostItem( INPUT, null, 151, 2, 0.000302, LLMGenerationCostItem.Status.OK ),
      new LLMGenerationCostItem( OUTPUT, null, 30, 10, 0.0003, LLMGenerationCostItem.Status.OK )
    ] );
  } );

  it( 'selects the highest applicable context tier', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricing( {
      input: 1,
      output: 2,
      tiers: [
        { input: 3, output: 4, tier: { type: 'context', size: 100 } },
        { input: 5, output: 6, tier: { type: 'context', size: 200 } }
      ]
    } ) );

    const result = await calculateCosts( usage( [
      item( INPUT, null, 201 ),
      item( OUTPUT, null, 10 )
    ] ), [] );

    expect( result.items.map( value => value.ppm ) ).toEqual( [ 5, 6 ] );
    expect( result.items.every( value => value.tier?.size === 200 ) ).toBe( true );
  } );

  it( 'preserves aggregate base pricing for legacy conversion', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricing( {
      input: 1,
      output: 2,
      tiers: [
        { input: 5, output: 6, tier: { type: 'context', size: 100 } }
      ]
    } ) );

    const result = await calculateLegacyCosts( usage( [
      item( INPUT, null, 201 ),
      item( OUTPUT, null, 10 )
    ] ) );

    expect( result.items ).toEqual( [
      new LLMGenerationCostItem( INPUT, null, 201, 1, 0.000201, LLMGenerationCostItem.Status.OK ),
      new LLMGenerationCostItem( OUTPUT, null, 10, 2, 0.00002, LLMGenerationCostItem.Status.OK )
    ] );
  } );

  it( 'uses base rates and marks the cost imprecise for an unsupported tier', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricing( {
      input: 2,
      output: 10,
      tiers: [
        {
          input: 4,
          output: 20,
          tier: { type: 'volume', size: 100 }
        }
      ]
    } ) );

    const result = await calculateCosts( usage( [
      item( INPUT, null, 101 ),
      item( OUTPUT, null, 10 )
    ] ), [] );

    expect( result.status ).toBe( LLMGenerationCost.Status.IMPRECISE );
    expect( result.items.map( value => value.ppm ) ).toEqual( [ 2, 10 ] );
    expect( result.items.every( value => value.status === LLMGenerationCostItem.Status.UNCERTAIN ) ).toBe( true );
  } );

  it( 'falls back to aggregate prices for unpriced specialized items', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricing( {
      input: 2,
      output: 10
    } ) );

    const result = await calculateCosts( usage( [
      item( INPUT, 'cache_read', 400_000 ),
      item( INPUT, 'cache_write', 100_000 ),
      item( OUTPUT, 'reasoning', 50_000 )
    ] ) );

    expect( result ).toMatchObject( {
      input: 1,
      output: 0.5,
      total: 1.5,
      status: LLMGenerationCost.Status.IMPRECISE
    } );
    expect( result.items.map( value => value.status ) ).toEqual( [
      LLMGenerationCostItem.Status.FALLBACK,
      LLMGenerationCostItem.Status.FALLBACK,
      LLMGenerationCostItem.Status.FALLBACK
    ] );
  } );

  it( 'marks cost incomplete while preserving totals for priced items', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricing( {
      input: 2
    } ) );

    const result = await calculateCosts( usage( [
      item( INPUT, null, 100 ),
      item( OUTPUT, null, 50 )
    ] ) );

    expect( result ).toMatchObject( {
      input: 0.0002,
      output: null,
      total: 0.0002,
      status: LLMGenerationCost.Status.INCOMPLETE
    } );
    expect( result.items ).toEqual( [
      new LLMGenerationCostItem( INPUT, null, 100, 2, 0.0002, LLMGenerationCostItem.Status.OK ),
      new LLMGenerationCostItem( OUTPUT, null, 50, null, null, LLMGenerationCostItem.Status.MISSING )
    ] );
  } );

  it( 'returns an incomplete cost when the model has no pricing reference', async () => {
    mockFetchModelsPricing.mockResolvedValue( table( new Map() ) );

    const result = await calculateCosts( usage( [
      item( INPUT, null, 100 ),
      item( OUTPUT, null, 50 )
    ] ) );

    expect( result ).toMatchObject( {
      input: null,
      output: null,
      total: null,
      status: LLMGenerationCost.Status.INCOMPLETE
    } );
    expect( result.items.every( value => value.status === LLMGenerationCostItem.Status.MISSING ) ).toBe( true );
    expect( Logger.warn ).toHaveBeenCalledWith(
      'Missing pricing reference for model',
      { namespace: 'LLM', modelId: MODEL_ID, providerId: PROVIDER_ID }
    );
  } );

  it( 'marks cost incomplete when usage is incomplete', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricing( {
      input: 2,
      output: 10
    } ) );

    const result = await calculateCosts( usage( [
      item( INPUT, null, 100 )
    ] ) );

    expect( result ).toMatchObject( {
      input: 0.0002,
      output: null,
      total: 0.0002,
      status: LLMGenerationCost.Status.INCOMPLETE
    } );
    expect( result.items[0].status ).toBe( LLMGenerationCostItem.Status.OK );
  } );

  it( 'accepts zero-valued prices as precise', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricing( {
      input: 0,
      output: 0
    } ) );

    const result = await calculateCosts( usage( [
      item( INPUT, null, 100 ),
      item( OUTPUT, null, 50 )
    ] ) );

    expect( result ).toMatchObject( {
      input: 0,
      output: 0,
      total: 0,
      status: LLMGenerationCost.Status.PRECISE
    } );
    expect( result.items.every( value => value.status === LLMGenerationCostItem.Status.OK ) ).toBe( true );
  } );

  it( 'prices a Gemini 3 grounding query from the local rate table', async () => {
    const providerId = 'google-vertex';
    const modelId = 'gemini-3-pro';
    mockFetchModelsPricing.mockResolvedValue( table( new Map( [
      [ `${providerId}/${modelId}`, { cost: { input: 2, output: 10 }, reasoning: false } ]
    ] ) ) );

    const result = await calculateCosts( usageFor( providerId, modelId, [
      item( INPUT, null, 1_000_000 ),
      item( OUTPUT, null, 500_000 ),
      item( TOOLS, 'grounding_query', 3 )
    ] ) );

    expect( result ).toMatchObject( {
      input: 2,
      output: 5,
      tools: 0.042,
      total: 7.042,
      status: LLMGenerationCost.Status.PRECISE
    } );
    expect( result.items.at( -1 ) ).toEqual(
      new LLMGenerationCostItem( TOOLS, 'grounding_query', 3, 14_000, 0.042, LLMGenerationCostItem.Status.OK )
    );
    expect( Logger.warn ).not.toHaveBeenCalled();
  } );

  it( 'prices a Gemini 2 grounding prompt from the local rate table', async () => {
    const providerId = 'google-vertex';
    const modelId = 'gemini-2.5-flash';
    mockFetchModelsPricing.mockResolvedValue( table( new Map( [
      [ `${providerId}/${modelId}`, { cost: { input: 2, output: 10 }, reasoning: false } ]
    ] ) ) );

    const result = await calculateCosts( usageFor( providerId, modelId, [
      item( INPUT, null, 1_000_000 ),
      item( OUTPUT, null, 500_000 ),
      item( TOOLS, 'grounding_prompt', 1 )
    ] ) );

    expect( result ).toMatchObject( {
      tools: 0.035,
      total: 7.035,
      status: LLMGenerationCost.Status.PRECISE
    } );
  } );

  it.each( [
    { providerId: 'anthropic', modelId: 'claude-haiku-4-5' },
    { providerId: 'openai', modelId: 'gpt-4.1-mini' }
  ] )( 'prices $providerId web search requests from the local rate table', async ( { providerId, modelId } ) => {
    mockFetchModelsPricing.mockResolvedValue( table( new Map( [
      [ `${providerId}/${modelId}`, { cost: { input: 2, output: 10 }, reasoning: false } ]
    ] ) ) );
    const providerUsage = new LLMGenerationUsage( modelId, providerId, [
      item( INPUT, null, 1_000_000 ),
      item( OUTPUT, null, 500_000 ),
      item( TOOLS, 'web_search', 3 )
    ] );

    const result = await calculateCosts( providerUsage );

    expect( result ).toMatchObject( {
      input: 2,
      output: 5,
      tools: 0.03,
      total: 7.03,
      status: LLMGenerationCost.Status.PRECISE
    } );
    expect( result.items.at( -1 ) ).toEqual(
      new LLMGenerationCostItem( TOOLS, 'web_search', 3, 10_000, 0.03, LLMGenerationCostItem.Status.OK )
    );
  } );

  it.each( [
    { name: 'reasoning', reasoning: true, ppm: 10_000, total: 0.03 },
    { name: 'non-reasoning', reasoning: false, ppm: 25_000, total: 0.075 }
  ] )( 'prices OpenAI preview search for a $name model', async ( { reasoning, ppm, total } ) => {
    const modelId = 'gpt-model';
    mockFetchModelsPricing.mockResolvedValue( table( new Map( [
      [ `openai/${modelId}`, {
        cost: { input: 2, output: 10 },
        reasoning
      } ]
    ] ) ) );
    const providerUsage = new LLMGenerationUsage( modelId, 'openai', [
      item( INPUT, null, 0 ),
      item( OUTPUT, null, 0 ),
      item( TOOLS, 'web_search_preview', 3 )
    ] );

    const result = await calculateCosts( providerUsage );

    expect( result ).toMatchObject( {
      tools: total,
      total,
      status: LLMGenerationCost.Status.PRECISE
    } );
    expect( result.items.at( -1 ) ).toEqual(
      new LLMGenerationCostItem( TOOLS, 'web_search_preview', 3, ppm, total, LLMGenerationCostItem.Status.OK )
    );
  } );

  it( 'never prices a tools item at the input token rate', async () => {
    mockFetchModelsPricing.mockResolvedValue( table( new Map() ) );

    const result = await calculateCosts( usageFor( 'google-vertex', 'gemini-3-pro', [
      item( TOOLS, 'grounding_query', 2 )
    ] ) );

    expect( result.items ).toEqual( [
      new LLMGenerationCostItem( TOOLS, 'grounding_query', 2, 14_000, 0.028, LLMGenerationCostItem.Status.OK )
    ] );
  } );

  it( 'marks an unrated grounded call incomplete and warns', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricing( { input: 2, output: 10 } ) );

    const result = await calculateCosts( usage( [
      item( INPUT, null, 1_000_000 ),
      item( OUTPUT, null, 500_000 ),
      item( TOOLS, 'grounding', 2 )
    ] ) );

    expect( result ).toMatchObject( {
      input: 2,
      output: 5,
      tools: null,
      total: 7,
      status: LLMGenerationCost.Status.INCOMPLETE
    } );
    expect( result.items.at( -1 ) ).toEqual(
      new LLMGenerationCostItem( TOOLS, 'grounding', 2, null, null, LLMGenerationCostItem.Status.MISSING )
    );
    expect( Logger.warn ).toHaveBeenCalledWith(
      'Tool call with no rate for model',
      { namespace: 'LLM', modelId: MODEL_ID, providerId: PROVIDER_ID, type: 'grounding' }
    );
  } );

  it( 'leaves an ungrounded cost without a tools total', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricing( { input: 2, output: 10 } ) );

    const result = await calculateCosts( usage( [
      item( INPUT, null, 1_000_000 ),
      item( OUTPUT, null, 500_000 )
    ] ) );

    expect( result.tools ).toBeNull();
    expect( result.total ).toBe( 7 );
  } );

  it( 'records the pricing freshness reported by the pricing table', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricing( { input: 2, output: 10 }, Freshness.CACHED ) );

    const result = await calculateCosts( usage( [
      item( INPUT, null, 1_000_000 ),
      item( OUTPUT, null, 500_000 )
    ] ) );

    expect( result.pricingFreshness ).toBe( Freshness.CACHED );
    expect( result.status ).toBe( LLMGenerationCost.Status.PRECISE );
  } );

  it( 'keeps exact rates precise when the cached table is stale', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricing( { input: 2, output: 10 }, Freshness.STALE ) );

    const result = await calculateCosts( usage( [
      item( INPUT, null, 1_000_000 ),
      item( OUTPUT, null, 500_000 )
    ] ) );

    expect( result.pricingFreshness ).toBe( Freshness.STALE );
    expect( result.status ).toBe( LLMGenerationCost.Status.PRECISE );
  } );

  it( 'marks the cost imprecise when priced from the bundled snapshot', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricing( { input: 2, output: 10 }, Freshness.SNAPSHOT ) );

    const result = await calculateCosts( usage( [
      item( INPUT, null, 1_000_000 ),
      item( OUTPUT, null, 500_000 )
    ] ) );

    expect( result.pricingFreshness ).toBe( Freshness.SNAPSHOT );
    expect( result.status ).toBe( LLMGenerationCost.Status.IMPRECISE );
    expect( result.total ).toBe( 7 );
    expect( result.items.every( value => value.status === LLMGenerationCostItem.Status.OK ) ).toBe( true );
  } );

  it( 'keeps an incomplete cost incomplete when priced from the bundled snapshot', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricing( { input: 2 }, Freshness.SNAPSHOT ) );

    const result = await calculateCosts( usage( [
      item( INPUT, null, 100 ),
      item( OUTPUT, null, 50 )
    ] ) );

    expect( result.status ).toBe( LLMGenerationCost.Status.INCOMPLETE );
  } );

  it( 'uses decimal arithmetic for fractional prices', async () => {
    mockFetchModelsPricing.mockResolvedValue( pricing( {
      input: 0.1,
      output: 0.2
    } ) );

    const result = await calculateCosts( usage( [
      item( INPUT, null, 1 ),
      item( INPUT, null, 2 ),
      item( OUTPUT, null, 3 )
    ] ) );

    expect( result.input ).toBe( 0.0000003 );
    expect( result.output ).toBe( 0.0000006 );
    expect( result.total ).toBe( 0.0000009 );
  } );
} );

describe( 'LLMGenerationCost', () => {
  it.each( [
    {
      name: 'precise',
      usageStatus: LLMGenerationUsage.Status.COMPLETE,
      itemStatus: LLMGenerationCostItem.Status.OK,
      expected: LLMGenerationCost.Status.PRECISE
    },
    {
      name: 'imprecise',
      usageStatus: LLMGenerationUsage.Status.COMPLETE,
      itemStatus: LLMGenerationCostItem.Status.FALLBACK,
      expected: LLMGenerationCost.Status.IMPRECISE
    },
    {
      name: 'imprecise from uncertain pricing',
      usageStatus: LLMGenerationUsage.Status.COMPLETE,
      itemStatus: LLMGenerationCostItem.Status.UNCERTAIN,
      expected: LLMGenerationCost.Status.IMPRECISE
    },
    {
      name: 'incomplete from missing pricing',
      usageStatus: LLMGenerationUsage.Status.COMPLETE,
      itemStatus: LLMGenerationCostItem.Status.MISSING,
      expected: LLMGenerationCost.Status.INCOMPLETE
    },
    {
      name: 'incomplete from usage',
      usageStatus: LLMGenerationUsage.Status.INCOMPLETE,
      itemStatus: LLMGenerationCostItem.Status.OK,
      expected: LLMGenerationCost.Status.INCOMPLETE
    },
    {
      name: 'incomplete over uncertain pricing',
      usageStatus: LLMGenerationUsage.Status.INCOMPLETE,
      itemStatus: LLMGenerationCostItem.Status.UNCERTAIN,
      expected: LLMGenerationCost.Status.INCOMPLETE
    },
    {
      name: 'precise with zero-value fallback pricing',
      usageStatus: LLMGenerationUsage.Status.COMPLETE,
      itemStatus: LLMGenerationCostItem.Status.FALLBACK,
      amount: 0,
      expected: LLMGenerationCost.Status.PRECISE
    },
    {
      name: 'precise with zero-value missing pricing',
      usageStatus: LLMGenerationUsage.Status.COMPLETE,
      itemStatus: LLMGenerationCostItem.Status.MISSING,
      amount: 0,
      expected: LLMGenerationCost.Status.PRECISE
    },
    {
      name: 'precise with live pricing',
      usageStatus: LLMGenerationUsage.Status.COMPLETE,
      itemStatus: LLMGenerationCostItem.Status.OK,
      pricingFreshness: Freshness.LIVE,
      expected: LLMGenerationCost.Status.PRECISE
    },
    {
      name: 'precise with cached pricing',
      usageStatus: LLMGenerationUsage.Status.COMPLETE,
      itemStatus: LLMGenerationCostItem.Status.OK,
      pricingFreshness: Freshness.CACHED,
      expected: LLMGenerationCost.Status.PRECISE
    },
    {
      name: 'precise with stale pricing',
      usageStatus: LLMGenerationUsage.Status.COMPLETE,
      itemStatus: LLMGenerationCostItem.Status.OK,
      pricingFreshness: Freshness.STALE,
      expected: LLMGenerationCost.Status.PRECISE
    },
    {
      name: 'imprecise with snapshot pricing',
      usageStatus: LLMGenerationUsage.Status.COMPLETE,
      itemStatus: LLMGenerationCostItem.Status.OK,
      pricingFreshness: Freshness.SNAPSHOT,
      expected: LLMGenerationCost.Status.IMPRECISE
    },
    {
      name: 'incomplete over snapshot pricing',
      usageStatus: LLMGenerationUsage.Status.INCOMPLETE,
      itemStatus: LLMGenerationCostItem.Status.OK,
      pricingFreshness: Freshness.SNAPSHOT,
      expected: LLMGenerationCost.Status.INCOMPLETE
    }
  ] )( 'sets $name status', ( { usageStatus, itemStatus, amount = 100, pricingFreshness, expected } ) => {
    const cost = new LLMGenerationCost( MODEL_ID, PROVIDER_ID, [
      new LLMGenerationCostItem( INPUT, null, amount, 2, 0.0002, itemStatus )
    ], usageStatus, pricingFreshness );

    expect( cost.status ).toBe( expected );
    expect( cost.pricingFreshness ).toBe( pricingFreshness ?? undefined );
  } );
} );
