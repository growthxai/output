import { fetchModelsPricing } from './models_pricing.js';
import { Tracing } from '@outputai/core/sdk/runtime';
import { LLMUsage, LLMUsageItem } from './usage.js';
import { Logger } from '@outputai/core';
import Decimal from 'decimal.js';

const exists = v => Number.isFinite( v );

export class LLMCostItem {
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

  constructor( group, label, amount, ppm, total, status ) {
    this.group = group;
    this.label = label;
    this.amount = amount;
    this.ppm = ppm;
    this.total = total;
    this.status = status;
  }
}

export class LLMCost extends Tracing.Attribute.BaseAttribute {
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
  total = null;
  status = LLMCost.Status.INCOMPLETE;
  items = [];

  constructor( modelId, providerId, items, usageStatus ) {
    super( LLMCost.TYPE );
    this.modelId = modelId;
    this.providerId = providerId;
    this.items = items;

    if ( items.some( v => v.status === LLMCostItem.Status.MISSING ) || usageStatus === LLMUsage.Status.INCOMPLETE ) {
      this.status = LLMCost.Status.INCOMPLETE;
    } else if ( items.some( v => v.status === LLMCostItem.Status.FALLBACK ) ) {
      this.status = LLMCost.Status.IMPRECISE;
    } else {
      this.status = LLMCost.Status.PRECISE;
    }
    const inputItems = items.filter( p => p.group === LLMUsageItem.Group.INPUT && exists( p.total ) );
    if ( inputItems.length > 0 ) {
      this.input = inputItems.reduce( ( s, p ) => s.add( p.total ), Decimal( 0 ) ).toNumber();
    }
    const outputItems = items.filter( p => p.group === LLMUsageItem.Group.OUTPUT && exists( p.total ) );
    if ( outputItems.length > 0 ) {
      this.output = outputItems.reduce( ( s, p ) => s.add( p.total ), Decimal( 0 ) ).toNumber();
    }
    if ( exists( this.input ) || exists( this.output ) ) {
      this.total = Decimal( this.input ?? 0 ).add( this.output ?? 0 ).toNumber();
    }
  }
}

const resolveValue = values => {
  if ( exists( values[0] ) ) {
    return { ppm: values[0], status: LLMCostItem.Status.OK };
  }
  const fallback = values.slice( 1 ).find( exists );
  if ( exists( fallback ) ) {
    return { ppm: fallback, status: LLMCostItem.Status.FALLBACK };
  }
  return { ppm: null, status: LLMCostItem.Status.MISSING };
};

const resolvePrice = ( { group, label, pricing } ) => {
  if ( !pricing ) {
    return resolveValue( [] );
  }
  if ( group === LLMUsageItem.Group.OUTPUT ) {
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

/**
 * Calculates the cost of an llm call based on the LLMUsage.
 *
 * @param {object} args
 * @param {object} args.usage - LLMUsageAttribute
 * @returns {object | null} LLM Cost with input, output, total and breakdown
 */
export const calculateCosts = async usage => {
  const models = await fetchModelsPricing();

  if ( !models ) {
    Logger.warn( 'Failed to fetch models pricing', { namespace: 'LLM' } );
    return null;
  }

  const { providerId, modelId } = usage;

  const pricing = models.get( `${providerId}/${modelId}` );
  if ( !pricing ) {
    Logger.warn( 'Missing pricing reference for model', { namespace: 'LLM', modelId, providerId } );
  }

  const items = usage.items.map( ( { group, label, amount } ) => {
    const { ppm, status } = resolvePrice( { pricing, group, label } );
    const total = exists( ppm ) ? Decimal( amount ).div( 1_000_000 ).mul( ppm ).toNumber() : null;
    return new LLMCostItem( group, label, amount, ppm, total, status );
  } );

  return new LLMCost( modelId, providerId, items, usage.status );
};
