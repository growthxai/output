import { describe, expect, it } from 'vitest';
import { LLMGenerationCost, LLMGenerationCostItem } from './llm_generation_cost.js';
import { LLMGenerationUsage, LLMGenerationUsageItem } from './llm_generation_usage.js';
import { CacheFreshness, PricingSource } from '../../consts.js';

const INPUT = LLMGenerationUsageItem.Group.INPUT;
const MODEL_ID = 'test-model';
const PROVIDER_ID = 'test-provider';

describe( 'LLMGenerationCost', () => {
  it.each( [
    {
      name: 'precise',
      usageStatus: LLMGenerationUsage.Status.COMPLETE,
      itemStatus: LLMGenerationCostItem.Status.OK,
      expected: LLMGenerationCost.Status.PRECISE,
      pricingFreshness: CacheFreshness.CACHED
    },
    {
      name: 'imprecise',
      usageStatus: LLMGenerationUsage.Status.COMPLETE,
      itemStatus: LLMGenerationCostItem.Status.FALLBACK,
      expected: LLMGenerationCost.Status.IMPRECISE,
      pricingFreshness: CacheFreshness.CACHED
    },
    {
      name: 'imprecise from uncertain pricing',
      usageStatus: LLMGenerationUsage.Status.COMPLETE,
      itemStatus: LLMGenerationCostItem.Status.UNCERTAIN,
      expected: LLMGenerationCost.Status.IMPRECISE,
      pricingFreshness: CacheFreshness.CACHED
    },
    {
      name: 'incomplete from missing pricing',
      usageStatus: LLMGenerationUsage.Status.COMPLETE,
      itemStatus: LLMGenerationCostItem.Status.MISSING,
      expected: LLMGenerationCost.Status.INCOMPLETE,
      pricingFreshness: CacheFreshness.CACHED
    },
    {
      name: 'incomplete from usage',
      usageStatus: LLMGenerationUsage.Status.INCOMPLETE,
      itemStatus: LLMGenerationCostItem.Status.OK,
      expected: LLMGenerationCost.Status.INCOMPLETE,
      pricingFreshness: CacheFreshness.CACHED
    },
    {
      name: 'incomplete over uncertain pricing',
      usageStatus: LLMGenerationUsage.Status.INCOMPLETE,
      itemStatus: LLMGenerationCostItem.Status.UNCERTAIN,
      expected: LLMGenerationCost.Status.INCOMPLETE,
      pricingFreshness: CacheFreshness.CACHED
    },
    {
      name: 'precise with zero-value fallback pricing',
      usageStatus: LLMGenerationUsage.Status.COMPLETE,
      itemStatus: LLMGenerationCostItem.Status.FALLBACK,
      amount: 0,
      expected: LLMGenerationCost.Status.PRECISE,
      pricingFreshness: CacheFreshness.CACHED
    },
    {
      name: 'precise with zero-value missing pricing',
      usageStatus: LLMGenerationUsage.Status.COMPLETE,
      itemStatus: LLMGenerationCostItem.Status.MISSING,
      amount: 0,
      expected: LLMGenerationCost.Status.PRECISE,
      pricingFreshness: CacheFreshness.CACHED
    },
    {
      name: 'precise with cached pricing',
      usageStatus: LLMGenerationUsage.Status.COMPLETE,
      itemStatus: LLMGenerationCostItem.Status.OK,
      pricingFreshness: CacheFreshness.CACHED,
      expected: LLMGenerationCost.Status.PRECISE
    },
    {
      name: 'precise with stale pricing',
      usageStatus: LLMGenerationUsage.Status.COMPLETE,
      itemStatus: LLMGenerationCostItem.Status.OK,
      pricingFreshness: CacheFreshness.STALE,
      expected: LLMGenerationCost.Status.PRECISE
    },
    {
      name: 'imprecise with snapshot pricing',
      usageStatus: LLMGenerationUsage.Status.COMPLETE,
      itemStatus: LLMGenerationCostItem.Status.OK,
      pricingFreshness: CacheFreshness.SNAPSHOT,
      expected: LLMGenerationCost.Status.IMPRECISE
    },
    {
      name: 'incomplete over snapshot pricing',
      usageStatus: LLMGenerationUsage.Status.INCOMPLETE,
      itemStatus: LLMGenerationCostItem.Status.OK,
      pricingFreshness: CacheFreshness.SNAPSHOT,
      expected: LLMGenerationCost.Status.INCOMPLETE
    }
  ] )( 'sets $name status', ( { usageStatus, itemStatus, amount = 100, pricingFreshness, expected } ) => {
    const cost = LLMGenerationCost.buildFromModelsDev( {
      modelId: MODEL_ID,
      providerId: PROVIDER_ID,
      items: [ new LLMGenerationCostItem( INPUT, null, amount, 2, 0.0002, itemStatus ) ],
      usageStatus,
      pricingFreshness
    } );

    expect( cost.status ).toBe( expected );
    expect( cost.pricingFreshness ).toBe( pricingFreshness );
    expect( cost.pricingSource ).toBe( PricingSource.MODELS_DEV );
  } );

  it( 'keeps zero when item totals are zero', () => {
    const cost = LLMGenerationCost.buildFromModelsDev( {
      modelId: MODEL_ID,
      providerId: PROVIDER_ID,
      items: [
        new LLMGenerationCostItem( INPUT, null, 0, 0, 0, LLMGenerationCostItem.Status.OK ),
        new LLMGenerationCostItem( LLMGenerationUsageItem.Group.OUTPUT, 'text', 0, 0, 0, LLMGenerationCostItem.Status.OK )
      ],
      usageStatus: LLMGenerationUsage.Status.COMPLETE,
      pricingFreshness: CacheFreshness.CACHED
    } );

    expect( cost ).toMatchObject( {
      input: 0,
      output: 0,
      tools: null,
      total: 0
    } );
  } );

  it( 'uses null totals when no item has a total', () => {
    const cost = LLMGenerationCost.buildFromModelsDev( {
      modelId: MODEL_ID,
      providerId: PROVIDER_ID,
      items: [ new LLMGenerationCostItem( INPUT, null, 100, null, null, LLMGenerationCostItem.Status.MISSING ) ],
      usageStatus: LLMGenerationUsage.Status.COMPLETE,
      pricingFreshness: CacheFreshness.CACHED
    } );

    expect( cost ).toMatchObject( {
      input: null,
      output: null,
      tools: null,
      total: null
    } );
  } );

  it( 'accepts a provider-reported total without items', () => {
    const cost = LLMGenerationCost.buildFromProvider( {
      modelId: MODEL_ID,
      providerId: PROVIDER_ID,
      promptName: 'writer@v1',
      requestDetails: { ids: [], count: 1, duration: 1 },
      total: 0.42,
      status: LLMGenerationCost.Status.PRECISE
    } );

    expect( cost ).toMatchObject( {
      total: 0.42,
      status: LLMGenerationCost.Status.PRECISE,
      pricingSource: PricingSource.PROVIDER,
      pricingFreshness: null,
      items: [],
      input: null,
      output: null,
      tools: null
    } );
  } );
} );
