import { Freshness } from '../models_pricing.js';
import { LLMGenerationUsage, LLMGenerationUsageItem } from './llm_generation_usage.js';
import Decimal from 'decimal.js';
import { isNonNegativeNumber } from '#helpers/number';
import { LLMGeneration } from './llm_generation.js';

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

export class LLMGenerationCost extends LLMGeneration {
  static TYPE = 'llm:generation:cost';
  static Status = Object.freeze( {
    PRECISE: 'precise',
    IMPRECISE: 'imprecise',
    INCOMPLETE: 'incomplete'
  } );

  input = null;
  output = null;
  tools = null;
  total = null;
  status = LLMGenerationCost.Status.INCOMPLETE;
  pricingFreshness = null;
  items = [];

  constructor( modelId, providerId, promptName, requestDetails, items, usageStatus, pricingFreshness ) {
    super( LLMGenerationCost.TYPE, modelId, providerId, promptName, requestDetails );

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
        const total = isNonNegativeNumber( ppm ) ? Decimal( amount ).div( 1_000_000 ).mul( ppm ).toNumber() : null;
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
      const groupItems = this.items.filter( p => p.group === group && isNonNegativeNumber( p.total ) );
      return groupItems.length > 0 ? groupItems.reduce( ( s, p ) => s.add( p.total ), Decimal( 0 ) ).toNumber() : null;
    };
    this.input = sumGroup( LLMGenerationUsageItem.Group.INPUT );
    this.output = sumGroup( LLMGenerationUsageItem.Group.OUTPUT );
    this.tools = sumGroup( LLMGenerationUsageItem.Group.TOOLS );
    if ( isNonNegativeNumber( this.input ) || isNonNegativeNumber( this.output ) || isNonNegativeNumber( this.tools ) ) {
      this.total = Decimal( this.input ?? 0 ).add( this.output ?? 0 ).add( this.tools ?? 0 ).toNumber();
    }
  }
}
