import { describe, expect, it, vi } from 'vitest';
import { calculateProviderCosts } from './provider_cost.js';
import { LLMGenerationCost } from './attributes/llm_generation_cost.js';
import { PricingSource } from '../consts.js';

const usage = {
  modelId: 'deepseek/deepseek-v4.1-flash',
  providerId: 'openrouter',
  promptName: 'writer@v1',
  requestDetails: { ids: [ 'req-1' ], count: 1, duration: 10 },
  status: 'complete'
};

const stepWithCost = cost => ( { providerMetadata: { openrouter: { usage: { cost } } } } );

const extractStepCost = providerMetadata => providerMetadata?.openrouter?.usage?.cost ?? null;

describe( 'calculateProviderCosts', () => {
  it( 'sums every step and marks precise when all amounts are valid', () => {
    const cost = calculateProviderCosts( usage, [ stepWithCost( 0.01 ), stepWithCost( 0.02 ) ], extractStepCost );

    expect( cost ).toMatchObject( {
      type: LLMGenerationCost.TYPE,
      modelId: usage.modelId,
      providerId: usage.providerId,
      promptName: usage.promptName,
      requestDetails: usage.requestDetails,
      total: 0.03,
      status: LLMGenerationCost.Status.PRECISE,
      pricingSource: PricingSource.PROVIDER,
      pricingFreshness: null,
      items: [],
      input: null,
      output: null,
      tools: null
    } );
  } );

  it( 'sums only valid amounts and marks incomplete when some steps are missing', () => {
    const cost = calculateProviderCosts( usage, [
      stepWithCost( 0.01 ),
      stepWithCost( null ),
      stepWithCost( 0.04 )
    ], extractStepCost );

    expect( cost.total ).toBe( 0.05 );
    expect( cost.status ).toBe( LLMGenerationCost.Status.INCOMPLETE );
    expect( cost.pricingSource ).toBe( PricingSource.PROVIDER );
  } );

  it( 'returns a null total and incomplete when no step has a valid amount', () => {
    const cost = calculateProviderCosts( usage, [ stepWithCost( null ), { providerMetadata: {} } ], extractStepCost );

    expect( cost.total ).toBeNull();
    expect( cost.status ).toBe( LLMGenerationCost.Status.INCOMPLETE );
  } );

  it( 'returns a null total and incomplete when there are no steps', () => {
    const cost = calculateProviderCosts( usage, [], extractStepCost );

    expect( cost.total ).toBeNull();
    expect( cost.status ).toBe( LLMGenerationCost.Status.INCOMPLETE );
  } );

  it( 'treats thrown extractors and negative amounts as missing', () => {
    const exploding = vi.fn( () => {
      throw new Error( 'boom' );
    } );

    expect( calculateProviderCosts( usage, [ stepWithCost( 0.01 ) ], exploding ).total ).toBeNull();
    expect( calculateProviderCosts( usage, [ stepWithCost( -1 ), stepWithCost( 0.02 ) ], extractStepCost ) )
      .toMatchObject( { total: 0.02, status: LLMGenerationCost.Status.INCOMPLETE } );
  } );

  it( 'accepts a zero amount as a valid free step', () => {
    const cost = calculateProviderCosts( usage, [ stepWithCost( 0 ), stepWithCost( 0.01 ) ], extractStepCost );

    expect( cost ).toMatchObject( {
      total: 0.01,
      status: LLMGenerationCost.Status.PRECISE
    } );
  } );

  it( 'keeps total at zero and precise when every step is free', () => {
    const cost = calculateProviderCosts( usage, [ stepWithCost( 0 ), stepWithCost( 0 ) ], extractStepCost );

    expect( cost ).toMatchObject( {
      total: 0,
      status: LLMGenerationCost.Status.PRECISE,
      pricingSource: PricingSource.PROVIDER
    } );
  } );
} );
