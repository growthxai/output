import Decimal from 'decimal.js';

const exists = v => Number.isFinite( v );

export const convertCostToLegacy = cost => {
  if ( !cost || cost.items.every( v => v.status === 'missing' ) ) {
    return null;
  }

  const result = {
    type: 'llm:usage',
    modelId: cost.modelId,
    usage: [],
    total: Decimal( 0 ),
    tokensUsed: Decimal( 0 )
  };

  // items
  const inputItem = cost.items.find( ( { group, label, total } ) => group === 'input' && !label && exists( total ) );
  const noCacheItem = cost.items.find( ( { label, total } ) => label === 'no_cache' && exists( total ) );
  const cacheReadItem = cost.items.find( ( { label } ) => label === 'cache_read' ); // even when it doesn't have total
  const cacheWriteItem = cost.items.find( ( { label, total } ) => label === 'cache_write' && exists( total ) );
  const outputItem = cost.items.find( ( { group, label, total } ) => group === 'output' && !label && exists( total ) );
  const textItem = cost.items.find( ( { label, total } ) => label === 'text' && exists( total ) );
  const reasoningItem = cost.items.find( ( { label, total } ) => label === 'reasoning' && exists( total ) );

  if ( inputItem ) {
    result.usage.push( { type: 'input', ppm: inputItem.ppm, amount: inputItem.amount } );
  } else {
    if ( noCacheItem || cacheWriteItem ) {
      const totalInput = ( noCacheItem?.amount ?? 0 ) + ( cacheWriteItem?.amount ?? 0 );
      const ppm = noCacheItem?.ppm ?? cacheWriteItem?.ppm;
      result.usage.push( { type: 'input', ppm, amount: totalInput } );
    }

    if ( cacheReadItem ) {
      const ppm = [ 'fallback', 'missing' ].includes( cacheReadItem.status ) ? 0 : cacheReadItem.ppm;
      result.usage.push( { type: 'input_cached', ppm, amount: cacheReadItem.amount } );
    }
  }

  if ( outputItem ) {
    result.usage.push( { type: 'output', ppm: outputItem.ppm, amount: outputItem.amount } );
  } else {
    if ( textItem ) {
      result.usage.push( { type: 'output', ppm: textItem.ppm, amount: textItem.amount } );
    }
    if ( reasoningItem ) {
      result.usage.push( { type: 'reasoning', ppm: reasoningItem.ppm, amount: reasoningItem.amount } );
    }
  }

  for ( const item of result.usage ) {
    item.total = Decimal( item.amount ).div( 1_000_000 ).mul( item.ppm ).toNumber();
    result.total = result.total.add( item.total );
    result.tokensUsed = result.tokensUsed.add( item.amount );
  }

  result.total = result.total.toNumber();
  result.tokensUsed = result.tokensUsed.toNumber();

  return result;
};
