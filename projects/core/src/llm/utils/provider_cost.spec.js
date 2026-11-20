import { describe, expect, it, vi } from 'vitest';
import { calculateProviderCosts, resolveProviderCostSteps } from './provider_cost.js';
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

describe( 'resolveProviderCostSteps', () => {
  it( 'keeps real steps when present', () => {
    const steps = [ stepWithCost( 0.1 ) ];
    expect( resolveProviderCostSteps( {
      steps,
      response: {
        finalStep: stepWithCost( 0.9 ),
        providerMetadata: { openrouter: { usage: { cost: 0.8 } } }
      }
    } ) ).toBe( steps );
  } );

  it( 'falls back to finalStep when steps are empty', () => {
    const finalStep = stepWithCost( 0.42 );
    expect( resolveProviderCostSteps( { steps: [], response: { finalStep } } ) ).toEqual( [ finalStep ] );
  } );

  it( 'falls back to top-level providerMetadata when there is no finalStep', () => {
    const providerMetadata = { openrouter: { usage: { cost: 0.42 } } };
    expect( resolveProviderCostSteps( { steps: [], response: { providerMetadata } } ) )
      .toEqual( [ { providerMetadata } ] );
  } );

  it( 'returns an empty list when nothing is available', () => {
    expect( resolveProviderCostSteps( { steps: [], response: {} } ) ).toEqual( [] );
    expect( resolveProviderCostSteps( { steps: [], response: null } ) ).toEqual( [] );
  } );
} );

describe( 'calculateProviderCosts', () => {
  it( 'sums every step and marks precise when all amounts are valid', () => {
    const cost = calculateProviderCosts( {
      usage,
      steps: [ stepWithCost( 0.01 ), stepWithCost( 0.02 ) ],
      extractor: extractStepCost
    } );

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
    const cost = calculateProviderCosts( {
      usage,
      steps: [ stepWithCost( 0.01 ), stepWithCost( null ), stepWithCost( 0.04 ) ],
      extractor: extractStepCost
    } );

    expect( cost.total ).toBe( 0.05 );
    expect( cost.status ).toBe( LLMGenerationCost.Status.INCOMPLETE );
    expect( cost.pricingSource ).toBe( PricingSource.PROVIDER );
  } );

  it( 'returns a null total and incomplete when no step has a valid amount', () => {
    const cost = calculateProviderCosts( {
      usage,
      steps: [ stepWithCost( null ), { providerMetadata: {} } ],
      extractor: extractStepCost
    } );

    expect( cost.total ).toBeNull();
    expect( cost.status ).toBe( LLMGenerationCost.Status.INCOMPLETE );
  } );

  it( 'returns a null total and incomplete when there are no steps', () => {
    const cost = calculateProviderCosts( { usage, steps: [], extractor: extractStepCost } );

    expect( cost.total ).toBeNull();
    expect( cost.status ).toBe( LLMGenerationCost.Status.INCOMPLETE );
  } );

  it( 'bills from finalStep when steps are empty', () => {
    const cost = calculateProviderCosts( {
      usage,
      steps: [],
      response: { finalStep: stepWithCost( 0.42 ) },
      extractor: extractStepCost
    } );

    expect( cost ).toMatchObject( {
      total: 0.42,
      status: LLMGenerationCost.Status.PRECISE,
      pricingSource: PricingSource.PROVIDER
    } );
  } );

  it( 'bills from response providerMetadata when steps and finalStep are missing', () => {
    const cost = calculateProviderCosts( {
      usage,
      steps: [],
      response: { providerMetadata: { openrouter: { usage: { cost: 0.42 } } } },
      extractor: extractStepCost
    } );

    expect( cost ).toMatchObject( {
      total: 0.42,
      status: LLMGenerationCost.Status.PRECISE,
      pricingSource: PricingSource.PROVIDER
    } );
  } );

  it( 'treats thrown extractors and negative amounts as missing', () => {
    const exploding = vi.fn( () => {
      throw new Error( 'boom' );
    } );

    expect( calculateProviderCosts( {
      usage,
      steps: [ stepWithCost( 0.01 ) ],
      extractor: exploding
    } ).total ).toBeNull();
    expect( calculateProviderCosts( {
      usage,
      steps: [ stepWithCost( -1 ), stepWithCost( 0.02 ) ],
      extractor: extractStepCost
    } ) ).toMatchObject( { total: 0.02, status: LLMGenerationCost.Status.INCOMPLETE } );
  } );

  it( 'accepts a zero amount as a valid free step', () => {
    const cost = calculateProviderCosts( {
      usage,
      steps: [ stepWithCost( 0 ), stepWithCost( 0.01 ) ],
      extractor: extractStepCost
    } );

    expect( cost ).toMatchObject( {
      total: 0.01,
      status: LLMGenerationCost.Status.PRECISE
    } );
  } );

  it( 'keeps total at zero and precise when every step is free', () => {
    const cost = calculateProviderCosts( {
      usage,
      steps: [ stepWithCost( 0 ), stepWithCost( 0 ) ],
      extractor: extractStepCost
    } );

    expect( cost ).toMatchObject( {
      total: 0,
      status: LLMGenerationCost.Status.PRECISE,
      pricingSource: PricingSource.PROVIDER
    } );
  } );
} );
