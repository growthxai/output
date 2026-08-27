import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetchModelsPricing = vi.hoisted( () => vi.fn() );

vi.mock( './models_pricing.js', () => ( {
  fetchModelsPricing: ( ...args ) => mockFetchModelsPricing( ...args )
} ) );

import { Logger } from '@outputai/core';
import { LLMCost, LLMCostItem, calculateCosts } from './cost.js';
import { LLMUsage, LLMUsageItem } from './usage.js';

const INPUT = LLMUsageItem.Group.INPUT;
const OUTPUT = LLMUsageItem.Group.OUTPUT;
const MODEL_ID = 'test-model';
const PROVIDER_ID = 'test-provider';

const item = ( group, label, amount ) => new LLMUsageItem( group, label, amount );
const usage = items => new LLMUsage( MODEL_ID, PROVIDER_ID, items );
const pricing = value => new Map( [ [ `${PROVIDER_ID}/${MODEL_ID}`, value ] ] );
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
    mockFetchModelsPricing.mockResolvedValue( null );

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

    expect( result ).toBeInstanceOf( LLMCost );
    expect( serialize( result ) ).toEqual( {
      type: LLMCost.TYPE,
      providerId: PROVIDER_ID,
      modelId: MODEL_ID,
      input: 2,
      output: 5,
      total: 7,
      status: LLMCost.Status.PRECISE,
      items: [
        {
          group: INPUT,
          label: null,
          amount: 1_000_000,
          ppm: 2,
          total: 2,
          status: LLMCostItem.Status.OK
        },
        {
          group: OUTPUT,
          label: null,
          amount: 500_000,
          ppm: 10,
          total: 5,
          status: LLMCostItem.Status.OK
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
      status: LLMCost.Status.PRECISE
    } );
    expect( result.items ).toEqual( [
      new LLMCostItem( INPUT, 'no_cache', 500_000, 4, 2, LLMCostItem.Status.OK ),
      new LLMCostItem( INPUT, 'cache_read', 400_000, 1, 0.4, LLMCostItem.Status.OK ),
      new LLMCostItem( INPUT, 'cache_write', 100_000, 5, 0.5, LLMCostItem.Status.OK ),
      new LLMCostItem( OUTPUT, 'text', 200_000, 10, 2, LLMCostItem.Status.OK ),
      new LLMCostItem( OUTPUT, 'reasoning', 50_000, 20, 1, LLMCostItem.Status.OK )
    ] );
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
      status: LLMCost.Status.IMPRECISE
    } );
    expect( result.items.map( value => value.status ) ).toEqual( [
      LLMCostItem.Status.FALLBACK,
      LLMCostItem.Status.FALLBACK,
      LLMCostItem.Status.FALLBACK
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
      status: LLMCost.Status.INCOMPLETE
    } );
    expect( result.items ).toEqual( [
      new LLMCostItem( INPUT, null, 100, 2, 0.0002, LLMCostItem.Status.OK ),
      new LLMCostItem( OUTPUT, null, 50, null, null, LLMCostItem.Status.MISSING )
    ] );
  } );

  it( 'returns an incomplete cost when the model has no pricing reference', async () => {
    mockFetchModelsPricing.mockResolvedValue( new Map() );

    const result = await calculateCosts( usage( [
      item( INPUT, null, 100 ),
      item( OUTPUT, null, 50 )
    ] ) );

    expect( result ).toMatchObject( {
      input: null,
      output: null,
      total: null,
      status: LLMCost.Status.INCOMPLETE
    } );
    expect( result.items.every( value => value.status === LLMCostItem.Status.MISSING ) ).toBe( true );
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
      status: LLMCost.Status.INCOMPLETE
    } );
    expect( result.items[0].status ).toBe( LLMCostItem.Status.OK );
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
      status: LLMCost.Status.PRECISE
    } );
    expect( result.items.every( value => value.status === LLMCostItem.Status.OK ) ).toBe( true );
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

describe( 'LLMCost', () => {
  it.each( [
    {
      name: 'precise',
      usageStatus: LLMUsage.Status.COMPLETE,
      itemStatus: LLMCostItem.Status.OK,
      expected: LLMCost.Status.PRECISE
    },
    {
      name: 'imprecise',
      usageStatus: LLMUsage.Status.COMPLETE,
      itemStatus: LLMCostItem.Status.FALLBACK,
      expected: LLMCost.Status.IMPRECISE
    },
    {
      name: 'incomplete from missing pricing',
      usageStatus: LLMUsage.Status.COMPLETE,
      itemStatus: LLMCostItem.Status.MISSING,
      expected: LLMCost.Status.INCOMPLETE
    },
    {
      name: 'incomplete from usage',
      usageStatus: LLMUsage.Status.INCOMPLETE,
      itemStatus: LLMCostItem.Status.OK,
      expected: LLMCost.Status.INCOMPLETE
    }
  ] )( 'sets $name status', ( { usageStatus, itemStatus, expected } ) => {
    const cost = new LLMCost( MODEL_ID, PROVIDER_ID, [
      new LLMCostItem( INPUT, null, 100, 2, 0.0002, itemStatus )
    ], usageStatus );

    expect( cost.status ).toBe( expected );
  } );
} );
