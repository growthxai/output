import { fetchModelsPricing } from './models_pricing.js';
import { LLMGenerationUsage, LLMGenerationUsageItem } from './attributes/llm_generation_usage.js';
import { resolveWebSearchPpm } from './web_search.js';
import { Logger } from '#runtime_logger';
import { LLMGenerationCost, LLMGenerationCostItem } from './attributes/llm_generation_cost.js';
import Decimal from 'decimal.js';
import { isNonNegativeNumber } from '#helpers/number';

// Selects the exact rate, then the first available fallback rate.
const resolveValue = values => {
  if ( isNonNegativeNumber( values[0] ) ) {
    return { ppm: values[0], status: LLMGenerationCostItem.Status.OK };
  }
  const fallback = values.slice( 1 ).find( isNonNegativeNumber );
  if ( isNonNegativeNumber( fallback ) ) {
    return { ppm: fallback, status: LLMGenerationCostItem.Status.FALLBACK };
  }
  return { ppm: null, status: LLMGenerationCostItem.Status.MISSING };
};

// Resolves the applicable token or provider-tool rate for one usage item.
const resolvePrice = ( { providerId, group, label, pricing, isReasoning } ) => {
  // Tool charges are never token-priced: models.dev has no rate for them.
  if ( group === LLMGenerationUsageItem.Group.TOOLS ) {
    return resolveValue( [ resolveWebSearchPpm( providerId, label, isReasoning ) ] );
  }
  if ( !pricing ) {
    return resolveValue( [] );
  }
  if ( group === LLMGenerationUsageItem.Group.OUTPUT ) {
    const values = [ pricing.output ];
    if ( label === 'reasoning' ) {
      values.unshift( pricing.reasoning );
    }
    return resolveValue( values );
  }

  const values = [ pricing.input ];
  if ( label === 'cache_read' ) {
    values.unshift( pricing.cache_read );
  } else if ( label === 'cache_write' ) {
    values.unshift( pricing.cache_write );
  }
  return resolveValue( values );
};

// Finds the highest context threshold crossed by this request's input.
const resolvePricingTier = ( modelPricing, input ) => {
  // DESC sort by size
  const supportedTiers = modelPricing.cost.tiers.filter( t => t?.tier?.type === 'context' && isNonNegativeNumber( t.tier.size ) );
  const hasUnsupported = supportedTiers.length !== modelPricing.cost.tiers.length;

  const sortedTiers = supportedTiers.toSorted( ( t1, t2 ) => t2.tier.size - t1.tier.size );
  const tier = sortedTiers.find( tier => input > tier.tier.size );

  return { tier, hasUnsupported };
};

// Calculates the price of each usage item
const calculateCostItems = ( { usage, pricing, isReasoning, uncertain } ) => {
  const { providerId } = usage;
  return usage.items.map( ( { group, label, amount } ) => {
    const { ppm, status } = resolvePrice( { providerId, isReasoning, group, label, pricing } );
    const total = isNonNegativeNumber( ppm ) ? Decimal( amount ).div( 1_000_000 ).mul( ppm ).toNumber() : null;

    const isTool = group === LLMGenerationUsageItem.Group.TOOLS;
    const isCostOk = status === LLMGenerationCostItem.Status.OK;

    const finalStatus = !isTool && isCostOk && uncertain ? LLMGenerationCostItem.Status.UNCERTAIN : status;

    const tier = !isTool && pricing?.tier?.type ? pricing.tier : null;
    return new LLMGenerationCostItem( group, label, amount, ppm, total, finalStatus, tier );
  } );
};

// Prices the total usage
const calculateStandardUsage = ( usage, modelPricing ) => {
  const { reasoning: isReasoning, cost: pricing } = modelPricing ?? {};
  return calculateCostItems( { usage, pricing, isReasoning } );
};

/* Prices the tiered usage:
- Multi-step + any incomplete step: base pricing, uncertain.
- Known request + no tier + no unsupported tiers: base, precise.
- Known request + no tier + unsupported tiers: base, uncertain.
- Known request + tier + no unsupported tiers: tier, precise.
- Known request + tier + unsupported tiers: tier, uncertain.
*/
const calculateTieredUsage = ( totalUsage, stepsUsage, modelPricing ) => {
  const { cost: pricing, reasoning: isReasoning } = modelPricing;

  const isMultiStep = stepsUsage.length > 1;
  const hasIncompleteSteps = stepsUsage.some( u => u?.status !== LLMGenerationUsage.Status.COMPLETE );

  // incomplete multi-steps fallback to calculate total usage with NO tiers, since token counts are unreliable
  if ( isMultiStep && hasIncompleteSteps ) {
    return calculateCostItems( { usage: totalUsage, pricing, isReasoning, uncertain: true } );
  }

  return ( isMultiStep ? stepsUsage : [ totalUsage ] ).flatMap( usage => {
    // output usage can't have tier billing
    if ( !isNonNegativeNumber( usage.input ) ) {
      return calculateCostItems( { usage, pricing, isReasoning } );
    }

    const pricingTier = resolvePricingTier( modelPricing, usage.input );

    // if there is a matching tier used, otherwise use base pricing
    const finalPricing = pricingTier.tier ?? pricing;

    // it will be uncertain if unsupported tiers exists
    return calculateCostItems( { usage, pricing: finalPricing, isReasoning, uncertain: pricingTier.hasUnsupported } );
  } );
};

// Returns whether model pricing has tier info or not
const hasTiers = modelPricing => Array.isArray( modelPricing?.cost?.tiers ) && modelPricing.cost.tiers.length > 0;

/**
 * Calculates the cost of an LLM call based on the LLMGenerationUsage.
 *
 * @param {LLMGenerationUsage} usage - Normalized LLM generation usage
 * @param {LLMGenerationUsage[]} stepsUsage - Per-request usage for multi-step calls
 * @returns {Promise<LLMGenerationCost | null>} LLM generation cost with input, output, total and breakdown
 */
export const calculateCosts = async ( usage, stepsUsage ) => {
  const { models, freshness: pricingFreshness } = await fetchModelsPricing();

  if ( !models ) {
    Logger.warn( 'Failed to fetch models pricing', { namespace: 'LLM' } );
    return null;
  }

  const { providerId, modelId } = usage;

  const modelPricing = models.get( `${providerId}/${modelId}` );
  if ( !modelPricing ) {
    Logger.warn( 'Missing pricing reference for model', { namespace: 'LLM', modelId, providerId } );
  }

  const items = hasTiers( modelPricing ) ? calculateTieredUsage( usage, stepsUsage, modelPricing ) : calculateStandardUsage( usage, modelPricing );

  const unrated = items.find( v => v.group === LLMGenerationUsageItem.Group.TOOLS && v.status === LLMGenerationCostItem.Status.MISSING );
  if ( unrated ) {
    Logger.warn( 'Tool call with no rate for model', { namespace: 'LLM', modelId, providerId, type: unrated.label } );
  }

  return new LLMGenerationCost( modelId, providerId, usage.promptName, usage.requestDetails, items, usage.status, pricingFreshness );
};

/**
 * Calculates a cost using the legacy aggregate pricing behavior.
 *
 * @param {LLMGenerationUsage} usage - Normalized aggregate LLM generation usage
 * @returns {Promise<LLMGenerationCost | null>} Cost compatible with the legacy conversion
 */
export const calculateLegacyCosts = async usage => {
  const { models, freshness: pricingFreshness } = await fetchModelsPricing();
  if ( !models ) {
    return null;
  }

  const { providerId, modelId } = usage;
  const modelPricing = models.get( `${providerId}/${modelId}` );
  const items = calculateStandardUsage( usage, modelPricing );

  return new LLMGenerationCost( modelId, providerId, null, null, items, usage.status, pricingFreshness );
};
