import { describe, expect, it } from 'vitest';
import { LLMGenerationCost, LLMGenerationCostItem } from './llm_generation_cost.js';
import { LLMGenerationUsage, LLMGenerationUsageItem } from './llm_generation_usage.js';
import { Freshness } from '../models_pricing.js';

const INPUT = LLMGenerationUsageItem.Group.INPUT;
const MODEL_ID = 'test-model';
const PROVIDER_ID = 'test-provider';

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
    const cost = new LLMGenerationCost( MODEL_ID, PROVIDER_ID, null, null, [
      new LLMGenerationCostItem( INPUT, null, amount, 2, 0.0002, itemStatus )
    ], usageStatus, pricingFreshness );

    expect( cost.status ).toBe( expected );
    expect( cost.pricingFreshness ).toBe( pricingFreshness ?? undefined );
  } );
} );
