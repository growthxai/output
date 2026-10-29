import { fetchModelsPricing, Freshness } from './models_pricing.js';
import { BaseAttribute } from '#trace_attribute';
import { LLMGenerationUsage, LLMGenerationUsageItem } from './usage.js';
import { resolveWebSearchPpm } from './web_search.js';
import { Logger } from '#runtime_logger';
import Decimal from 'decimal.js';

// Checks whether a pricing value can be used in cost calculations.
const isValidNumber = v => Number.isFinite( v ) && v >= 0;

export class LLMGenerationCostItem {
  static Status = Object.freeze( {
    OK: 'ok',
    FALLBACK: 'fallback',
    UNCERTAIN: 'uncertain',
    MISSING: 'missing'
  } );

  group;
  label;
  amount;
  ppm;
  total;
  status;

  constructor( group, label, amount, ppm, total, status, tier = undefined ) {
    this.group = group;
    this.label = label;
    this.amount = amount;
    this.ppm = ppm;
    this.total = total;
    this.status = status;
    if ( tier ) {
      this.tier = { type: tier.type, size: tier.size };
    }
  }

  get key() {
    return JSON.stringify( [ this.group, this.label, this.ppm, this.status, this.tier?.type, this.tier?.size ] );
  }
}

export class LLMGenerationCost extends BaseAttribute {
  static TYPE = 'llm:generation:cost';
  static Status = Object.freeze( {
    PRECISE: 'precise',
    IMPRECISE: 'imprecise',
    INCOMPLETE: 'incomplete'
  } );
  providerId;
  modelId;
  input = null;
  output = null;
  tools = null;
  total = null;
  status = LLMGenerationCost.Status.INCOMPLETE;
  pricingFreshness = null;
  items = [];

  constructor( modelId, providerId, items, usageStatus, pricingFreshness ) {
    super( LLMGenerationCost.TYPE );
    this.modelId = modelId;
    this.providerId = providerId;

    // group items with the same key, summing amount
    this.items = Map.groupBy( items, e => e.key )
      .values()
      .toArray()
      .map( items => {
        if ( items.length === 1 ) {
          return items[0];
        }

        const { group, label, ppm, status, tier } = items[0];
        const amount = items.reduce( ( sum, item ) => sum + item.amount, 0 );
        const total = isValidNumber( ppm ) ? Decimal( amount ).div( 1_000_000 ).mul( ppm ).toNumber() : null;
        return new LLMGenerationCostItem( group, label, amount, ppm, total, status, tier );
      } );

    this.pricingFreshness = pricingFreshness;

    const meaningfulItems = this.items.filter( v => v.amount > 0 );
    const hasMissingItems = meaningfulItems.some( v => v.status === LLMGenerationCostItem.Status.MISSING );
    const hasFallbackItems = meaningfulItems.some( v => v.status === LLMGenerationCostItem.Status.FALLBACK );
    const hasUncertainItems = meaningfulItems.some( v => v.status === LLMGenerationCostItem.Status.UNCERTAIN );

    if ( hasMissingItems || usageStatus === LLMGenerationUsage.Status.INCOMPLETE ) {
      this.status = LLMGenerationCost.Status.INCOMPLETE;
    } else if ( hasFallbackItems || pricingFreshness === Freshness.SNAPSHOT || hasUncertainItems ) {
      this.status = LLMGenerationCost.Status.IMPRECISE;
    } else {
      this.status = LLMGenerationCost.Status.PRECISE;
    }

    const sumGroup = group => {
      const groupItems = this.items.filter( p => p.group === group && isValidNumber( p.total ) );
      return groupItems.length > 0 ? groupItems.reduce( ( s, p ) => s.add( p.total ), Decimal( 0 ) ).toNumber() : null;
    };
    this.input = sumGroup( LLMGenerationUsageItem.Group.INPUT );
    this.output = sumGroup( LLMGenerationUsageItem.Group.OUTPUT );
    this.tools = sumGroup( LLMGenerationUsageItem.Group.TOOLS );
    if ( isValidNumber( this.input ) || isValidNumber( this.output ) || isValidNumber( this.tools ) ) {
      this.total = Decimal( this.input ?? 0 ).add( this.output ?? 0 ).add( this.tools ?? 0 ).toNumber();
    }
  }
}

// Selects the exact rate, then the first available fallback rate.
const resolveValue = values => {
  if ( isValidNumber( values[0] ) ) {
    return { ppm: values[0], status: LLMGenerationCostItem.Status.OK };
  }
  const fallback = values.slice( 1 ).find( isValidNumber );
  if ( isValidNumber( fallback ) ) {
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
  const supportedTiers = modelPricing.cost.tiers.filter( t => t?.tier?.type === 'context' && isValidNumber( t.tier.size ) );
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
    const total = isValidNumber( ppm ) ? Decimal( amount ).div( 1_000_000 ).mul( ppm ).toNumber() : null;

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

// Prices the tiered usage
const calculateTieredUsage = ( totalUsage, stepsUsage, modelPricing ) => {
  const shouldUseStepsUsage = stepsUsage.length > 1;
  const stepsUsageIsComplete = stepsUsage.every( u => u?.status === LLMGenerationUsage.Status.COMPLETE );

  const usages = stepsUsageIsComplete && shouldUseStepsUsage ? stepsUsage : [ totalUsage ];
  const isReasoning = modelPricing.reasoning;

  return usages.flatMap( usage => {
    const { cost: pricing } = modelPricing;

    // output usage can't have tier billing
    if ( !isValidNumber( usage.input ) ) {
      return calculateCostItems( { usage, pricing, isReasoning } );
    }

    const pricingTier = resolvePricingTier( modelPricing, usage.input );
    // if no tier could be resolved, use base pricing
    if ( !pricingTier.tier && !pricingTier.hasUnsupported ) {
      return calculateCostItems( { usage, pricing, isReasoning } );
    }

    // detect whether the tier calculation was imprecise either because it should have used individual steps but used total usage, or if the tier cost has unsupported elements
    const uncertain = ( !stepsUsageIsComplete && shouldUseStepsUsage ) || pricingTier.hasUnsupported;
    return calculateCostItems( { usage, pricing: pricingTier.tier ?? pricing, isReasoning, uncertain } );
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

  return new LLMGenerationCost( modelId, providerId, items, usage.status, pricingFreshness );
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

  return new LLMGenerationCost( modelId, providerId, items, usage.status, pricingFreshness );
};
