import Decimal from 'decimal.js';
import { LLMCostItem } from './cost.js';

const TYPE_ORDER = [ 'input', 'input_cached', 'output', 'reasoning' ];

const legacyItem = ( item, inputPpm ) => {
  const { group, label, status } = item;
  const line = ( type, ppm = item.ppm, total = item.total ) => ( {
    type,
    ppm,
    amount: item.amount,
    total
  } );

  if ( group === 'input' ) {
    if ( label === 'cache_read' ) {
      return status === LLMCostItem.Status.OK ?
        line( 'input_cached' ) :
        line( 'input_cached', 0, 0 );
    }
    if ( label === 'cache_write' ) {
      const ppm = inputPpm ?? item.ppm;
      const total = Decimal( item.amount ).div( 1_000_000 ).mul( ppm ).toNumber();
      return line( 'input', ppm, total );
    }
    if ( label === null || label === 'no_cache' ) {
      return line( 'input' );
    }
    return null;
  }

  if ( group === 'output' ) {
    if ( label === 'reasoning' ) {
      return status === LLMCostItem.Status.FALLBACK ? null : line( 'reasoning' );
    }
    if ( label === null || label === 'text' ) {
      return line( 'output' );
    }
    return null;
  }

  return null;
};

/**
 * Converts an LLMCost into the legacy cost:llm:request payload.
 *
 * Items without a calculated price are omitted, matching the legacy event's
 * priced-usage semantics.
 *
 * @param {import('./cost.js').LLMCost} cost - New LLM cost object
 * @returns {{
 *   type: 'llm:usage',
 *   modelId: string,
 *   usage: Array<{ type: string, ppm: number, amount: number, total: number }>,
 *   total: number,
 *   tokensUsed: number
 * } | null} Legacy LLM usage event payload
 */
export const toLegacyLLMUsageEvent = cost => {
  if ( !Number.isFinite( cost.total ) ) {
    return null;
  }

  const usage = [];
  const inputPpm = cost.items.find( item =>
    item.group === 'input' &&
    ( item.label === null || item.label === 'no_cache' ) &&
    Number.isFinite( item.ppm )
  )?.ppm;
  for ( const item of cost.items ) {
    const missingCacheRead = item.group === 'input' &&
      item.label === 'cache_read' &&
      item.status === LLMCostItem.Status.MISSING;
    if (
      ( item.status === LLMCostItem.Status.MISSING && !missingCacheRead ) ||
      ( !missingCacheRead && ( !Number.isFinite( item.ppm ) || !Number.isFinite( item.total ) ) )
    ) {
      continue;
    }

    const mapped = legacyItem( item, inputPpm );
    if ( !mapped ) {
      continue;
    }

    const existing = usage.find( value => value.type === mapped.type && value.ppm === mapped.ppm );
    if ( existing ) {
      existing.amount = Decimal( existing.amount ).add( mapped.amount ).toNumber();
      existing.total = Decimal( existing.total ).add( mapped.total ).toNumber();
    } else {
      usage.push( mapped );
    }
  }
  usage.sort( ( left, right ) => {
    const leftIndex = TYPE_ORDER.indexOf( left.type );
    const rightIndex = TYPE_ORDER.indexOf( right.type );
    return ( leftIndex < 0 ? TYPE_ORDER.length : leftIndex ) - ( rightIndex < 0 ? TYPE_ORDER.length : rightIndex );
  } );
  if ( usage.length === 0 ) {
    return null;
  }

  return {
    type: 'llm:usage',
    modelId: cost.modelId,
    usage,
    total: usage.reduce( ( sum, item ) => sum.add( item.total ), Decimal( 0 ) ).toNumber(),
    tokensUsed: usage.reduce( ( sum, item ) => sum.add( item.amount ), Decimal( 0 ) ).toNumber()
  };
};
