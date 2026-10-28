import { fetchModelsPricing, Freshness } from './models_pricing.js';
import { BaseAttribute } from '#trace_attribute';
import { LLMGenerationUsage, LLMGenerationUsageItem } from './usage.js';
import { resolveWebSearchPpm } from './web_search.js';
import { Logger } from '#runtime_logger';
import Decimal from 'decimal.js';

// Checks whether a pricing value can be used in cost calculations.
const exists = v => Number.isFinite( v );
const CONTEXT_TIER = 'context';

export class LLMGenerationCostItem {
  static Status = Object.freeze( {
    OK: 'ok',
    FALLBACK: 'fallback',
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
    this.items = items;
    this.pricingFreshness = pricingFreshness;

    const meaningfulItems = items.filter( v => v.amount > 0 );

    if ( meaningfulItems.some( v => v.status === LLMGenerationCostItem.Status.MISSING ) || usageStatus === LLMGenerationUsage.Status.INCOMPLETE ) {
      this.status = LLMGenerationCost.Status.INCOMPLETE;
    } else if ( meaningfulItems.some( v => v.status === LLMGenerationCostItem.Status.FALLBACK ) || pricingFreshness === Freshness.SNAPSHOT ) {
      this.status = LLMGenerationCost.Status.IMPRECISE;
    } else {
      this.status = LLMGenerationCost.Status.PRECISE;
    }

    const sumGroup = group => {
      const groupItems = items.filter( p => p.group === group && exists( p.total ) );
      return groupItems.length > 0 ? groupItems.reduce( ( s, p ) => s.add( p.total ), Decimal( 0 ) ).toNumber() : null;
    };
    this.input = sumGroup( LLMGenerationUsageItem.Group.INPUT );
    this.output = sumGroup( LLMGenerationUsageItem.Group.OUTPUT );
    this.tools = sumGroup( LLMGenerationUsageItem.Group.TOOLS );
    if ( exists( this.input ) || exists( this.output ) || exists( this.tools ) ) {
      this.total = Decimal( this.input ?? 0 ).add( this.output ?? 0 ).add( this.tools ?? 0 ).toNumber();
    }
  }
}

// Selects the exact rate, then the first available fallback rate.
const resolveValue = values => {
  if ( exists( values[0] ) ) {
    return { ppm: values[0], status: LLMGenerationCostItem.Status.OK };
  }
  const fallback = values.slice( 1 ).find( exists );
  if ( exists( fallback ) ) {
    return { ppm: fallback, status: LLMGenerationCostItem.Status.FALLBACK };
  }
  return { ppm: null, status: LLMGenerationCostItem.Status.MISSING };
};

// Resolves the applicable token or provider-tool rate for one usage item.
const resolvePrice = ( { providerId, group, label, modelPricing, pricing = modelPricing?.cost } ) => {
  // Tool charges are never token-priced: models.dev has no rate for them.
  if ( group === LLMGenerationUsageItem.Group.TOOLS ) {
    return resolveValue( [ resolveWebSearchPpm( providerId, label, modelPricing ) ] );
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
  const sortedTiers = ( modelPricing?.cost?.tiers ?? [] ).toSorted( ( t1, t2 ) => t2.tier.size - t1.tier.size );
  return sortedTiers.find( tier => input > tier.tier.size );
};

// Prices the aggregate usage with standard model rates.
const calculateStandardUsage = ( usage, modelPricing ) => usage.items.map( ( { group, label, amount } ) => {
  const { ppm, status } = resolvePrice( { providerId: usage.providerId, modelPricing, group, label } );
  const total = exists( ppm ) ? Decimal( amount ).div( 1_000_000 ).mul( ppm ).toNumber() : null;
  return new LLMGenerationCostItem( group, label, amount, ppm, total, status );
} );

// Combines request items that used the same label, rate, status, and tier.
const mergeCostItems = items => {
  const itemsByPrice = new Map();

  for ( const item of items ) {
    const key = JSON.stringify( [
      item.group,
      item.label,
      item.ppm,
      item.status,
      item.tier?.type,
      item.tier?.size
    ] );

    if ( !itemsByPrice.has( key ) ) {
      itemsByPrice.set( key, item );
      continue;
    }

    const current = itemsByPrice.get( key );
    current.amount += item.amount;
    current.total = exists( current.total ) && exists( item.total ) ?
      Decimal( current.total ).add( item.total ).toNumber() :
      null;
  }

  return [ ...itemsByPrice.values() ];
};

// Prices each provider request with its tier and combines matching pricing segments.
const calculateTieredUsage = ( usage, requestUsages, modelPricing ) => {
  const usages = Array.isArray( requestUsages ) && requestUsages.length > 0 ? requestUsages : [ usage ];
  const items = usages.flatMap( requestUsage => {
    const pricing = {
      ...modelPricing.cost,
      // override with tier info
      ...( exists( requestUsage.input ) ? resolvePricingTier( modelPricing, requestUsage.input ) : {} )
    };

    return requestUsage.items.map( ( { group, label, amount } ) => {
      const price = resolvePrice( { providerId: requestUsage.providerId, modelPricing, pricing, group, label } );
      const total = exists( price.ppm ) ? Decimal( amount ).div( 1_000_000 ).mul( price.ppm ).toNumber() : null;
      const itemTier = group === LLMGenerationUsageItem.Group.TOOLS ? undefined : pricing?.tier;
      return new LLMGenerationCostItem( group, label, amount, price.ppm, total, price.status, itemTier );
    } );
  } );

  return mergeCostItems( items );
};

// Returns whether model pricing has tier info or not
const hasTiers = modelPricing => Array.isArray( modelPricing?.cost?.tiers ) && modelPricing.cost.tiers.length > 0;

// Downgrade each non tool item from OK to FALLBACK
const downgradeItemsConfidence = items => items.map( item => {
  if ( item.group === LLMGenerationUsageItem.Group.TOOLS || item.status !== LLMGenerationCostItem.Status.OK ) {
    return item;
  }
  return new LLMGenerationCostItem(
    item.group,
    item.label,
    item.amount,
    item.ppm,
    item.total,
    LLMGenerationCostItem.Status.FALLBACK,
    item.tier
  );
} );

// Checks whether every declared tier can be resolved as a context threshold.
const checkTiersAreSupported = modelPricing =>
  modelPricing?.cost?.tiers.every( value => value?.tier?.type === CONTEXT_TIER && exists( value.tier.size ) ) ?? false;

/**
 * Calculates the cost of an LLM call based on the LLMGenerationUsage.
 *
 * @param {LLMGenerationUsage} usage - Normalized LLM generation usage
 * @param {LLMGenerationUsage[]} [requestUsages] - Per-request usage for multi-step calls
 * @returns {Promise<LLMGenerationCost | null>} LLM generation cost with input, output, total and breakdown
 */
export const calculateCosts = async ( usage, requestUsages = null ) => {
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

  const items = ( () => {
    if ( !hasTiers( modelPricing ) ) {
      return calculateStandardUsage( usage, modelPricing );
    } else if ( checkTiersAreSupported( modelPricing ) ) {
      return calculateTieredUsage( usage, requestUsages, modelPricing );
    } else {
      Logger.warn( 'Unsupported model pricing tier', { namespace: 'LLM', modelId, providerId } );
      return downgradeItemsConfidence( calculateStandardUsage( usage, modelPricing ) );
    }
  } )();

  const unrated = items.find( v => v.group === LLMGenerationUsageItem.Group.TOOLS && v.status === LLMGenerationCostItem.Status.MISSING );
  if ( unrated ) {
    Logger.warn( 'Tool call with no rate for model', { namespace: 'LLM', modelId, providerId, type: unrated.label } );
  }

  return new LLMGenerationCost( modelId, providerId, items, usage.status, pricingFreshness );
};
