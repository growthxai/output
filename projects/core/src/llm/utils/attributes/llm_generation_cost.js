import { CacheFreshness, PricingSource } from '../../consts.js';
import { LLMGenerationUsage, LLMGenerationUsageItem } from './llm_generation_usage.js';
import Decimal from 'decimal.js';
import { isNonNegativeNumber } from '#helpers/number';
import { LLMGeneration } from './llm_generation.js';

const LLMGenerationCostStatus = Object.freeze( {
  PRECISE: 'precise',
  IMPRECISE: 'imprecise',
  INCOMPLETE: 'incomplete'
} );

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

const groupItems = rawItems => Map.groupBy( rawItems, e => e.key )
  .values()
  .toArray()
  .map( items => {
    if ( items.length === 1 ) {
      return items[0];
    }

    const { group, label, ppm, status: itemStatus, tier } = items[0];
    const amount = items.reduce( ( sum, item ) => sum + item.amount, 0 );
    const itemTotal = isNonNegativeNumber( ppm ) ? Decimal( amount ).div( 1_000_000 ).mul( ppm ).toNumber() : null;
    return new LLMGenerationCostItem( group, label, amount, ppm, itemTotal, itemStatus, tier );
  } );

const resolveStatus = ( { items, usageStatus, pricingFreshness } ) => {
  const statuses = items.filter( i => i.amount > 0 ).reduce( ( summary, item ) =>
    Object.assign( summary, { [item.status]: true } ), {} );

  const hasMissing = statuses[LLMGenerationCostItem.Status.MISSING];
  const hasFallback = statuses[LLMGenerationCostItem.Status.FALLBACK];
  const hasUncertain = statuses[LLMGenerationCostItem.Status.UNCERTAIN];
  const isIncomplete = usageStatus === LLMGenerationUsage.Status.INCOMPLETE;
  const isSnapshot = pricingFreshness === CacheFreshness.SNAPSHOT;

  if ( hasMissing || isIncomplete ) {
    return LLMGenerationCostStatus.INCOMPLETE;
  }

  if ( hasFallback || hasUncertain || isSnapshot ) {
    return LLMGenerationCostStatus.IMPRECISE;
  }

  return LLMGenerationCostStatus.PRECISE;
};

/**
 * Sum item totals. If totals have value 0, return 0. If there are no items with total, return null
 */
const sumItemsByGroup = ( items, group ) => {
  const meaningfulItems = items.filter( p => p.group === group && isNonNegativeNumber( p.total ) );
  return meaningfulItems.length > 0 ? meaningfulItems.reduce( ( s, p ) => s.add( p.total ), Decimal( 0 ) ).toNumber() : null;
};

export class LLMGenerationCost extends LLMGeneration {
  static TYPE = 'llm:generation:cost';
  static Status = LLMGenerationCostStatus;

  input = null;
  output = null;
  tools = null;
  total = null;
  status = LLMGenerationCost.Status.INCOMPLETE;
  pricingFreshness = null;
  pricingSource;
  items = [];

  static buildFromProvider( { modelId, providerId, promptName, requestDetails, total, status } ) {
    const instance = new LLMGenerationCost( modelId, providerId, promptName, requestDetails );
    instance.pricingSource = PricingSource.PROVIDER;
    instance.total = total;
    instance.status = status;
    return instance;
  }

  static buildFromModelsDev( { modelId, providerId, promptName, requestDetails, items: rawItems, usageStatus, pricingFreshness } ) {
    const items = groupItems( rawItems );
    const status = resolveStatus( { items, usageStatus, pricingFreshness } );
    const input = sumItemsByGroup( items, LLMGenerationUsageItem.Group.INPUT );
    const output = sumItemsByGroup( items, LLMGenerationUsageItem.Group.OUTPUT );
    const tools = sumItemsByGroup( items, LLMGenerationUsageItem.Group.TOOLS );

    const totals = [ input, output, tools ].filter( isNonNegativeNumber );
    const total = totals.length > 0 ? totals.reduce( ( s, v ) => s.add( v ), Decimal( 0 ) ).toNumber() : null;

    const instance = new LLMGenerationCost( modelId, providerId, promptName, requestDetails );
    instance.pricingSource = PricingSource.MODELS_DEV;
    instance.pricingFreshness = pricingFreshness;
    instance.items = items;
    instance.status = status;
    instance.input = input;
    instance.output = output;
    instance.tools = tools;
    instance.total = total;
    return instance;
  }

  constructor( modelId, providerId, promptName, requestDetails = null ) {
    super( LLMGenerationCost.TYPE, modelId, providerId, promptName, requestDetails );
  }
}
