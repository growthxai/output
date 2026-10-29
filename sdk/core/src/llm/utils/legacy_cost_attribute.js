import { BaseAttribute } from '#trace_attribute';
import Decimal from 'decimal.js';

const isValidNumber = v => Number.isFinite( v ) && v >= 0;

/** Legacy priced usage attribute retained for trace compatibility. */
export class LLMUsageLegacy extends BaseAttribute {
  static TYPE = 'llm:usage';
  modelId;
  usage = [];
  total;
  tokensUsed;

  constructor( modelId, usage ) {
    super( LLMUsageLegacy.TYPE );
    this.modelId = modelId;
    this.usage = usage;
    this.total = Decimal( 0 );
    this.tokensUsed = Decimal( 0 );

    for ( const item of usage ) {
      item.total = Decimal( item.amount ).div( 1_000_000 ).mul( item.ppm ).toNumber();
      this.total = this.total.add( item.total );
      this.tokensUsed = this.tokensUsed.add( item.amount );
    }

    this.total = this.total.toNumber();
    this.tokensUsed = this.tokensUsed.toNumber();
  }
}

export const convertCostToLegacy = cost => {
  if ( !cost || cost.items.every( v => v.status === 'missing' ) ) {
    return null;
  }

  const usage = [];
  const itemGroups = Map.groupBy(
    cost.items.filter( ( { group } ) => group !== 'tools' ),
    item => JSON.stringify( item.tier ?? null )
  );

  for ( const items of itemGroups.values() ) {
    const inputItem = items.find( ( { group, label, total } ) => group === 'input' && !label && isValidNumber( total ) );
    const noCacheItem = items.find( ( { label, total } ) => label === 'no_cache' && isValidNumber( total ) );
    const cacheReadItem = items.find( ( { label } ) => label === 'cache_read' ); // even when it doesn't have total
    const cacheWriteItem = items.find( ( { label, total } ) => label === 'cache_write' && isValidNumber( total ) );
    const outputItem = items.find( ( { group, label, total } ) => group === 'output' && !label && isValidNumber( total ) );
    const textItem = items.find( ( { label, total } ) => label === 'text' && isValidNumber( total ) );
    const reasoningItem = items.find( ( { label, total } ) => label === 'reasoning' && isValidNumber( total ) );

    if ( inputItem ) {
      usage.push( { type: 'input', ppm: inputItem.ppm, amount: inputItem.amount } );
    } else {
      if ( noCacheItem || cacheWriteItem ) {
        const totalInput = ( noCacheItem?.amount ?? 0 ) + ( cacheWriteItem?.amount ?? 0 );
        const ppm = noCacheItem?.ppm ?? cacheWriteItem?.ppm;
        usage.push( { type: 'input', ppm, amount: totalInput } );
      }

      if ( cacheReadItem ) {
        const ppm = [ 'fallback', 'missing' ].includes( cacheReadItem.status ) ? 0 : cacheReadItem.ppm;
        usage.push( { type: 'input_cached', ppm, amount: cacheReadItem.amount } );
      }
    }

    if ( outputItem ) {
      usage.push( { type: 'output', ppm: outputItem.ppm, amount: outputItem.amount } );
    } else {
      if ( textItem ) {
        usage.push( { type: 'output', ppm: textItem.ppm, amount: textItem.amount } );
      }
      if ( reasoningItem ) {
        usage.push( { type: 'reasoning', ppm: reasoningItem.ppm, amount: reasoningItem.amount } );
      }
    }
  }

  return new LLMUsageLegacy( cost.modelId, usage );
};
