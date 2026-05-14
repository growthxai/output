import { Attribute } from '#trace_attribute';
import Decimal from 'decimal.js';

export const aggregateAttributes = attributes => ( {
  cost: {
    total: attributes
      .filter( a => [ Attribute.HTTPRequestCost.TYPE, Attribute.LLMUsage.TYPE ].includes( a.type ) )
      .reduce( ( sum, a ) => Decimal( a.total ).add( sum ).toNumber(), 0 )
  },
  tokens: {
    total: attributes
      .filter( a => Attribute.LLMUsage.TYPE === a.type )
      .reduce( ( sum, a ) => Decimal( a.tokensUsed ).add( sum ).toNumber(), 0 ),
    ...attributes
      .filter( a => Attribute.LLMUsage.TYPE === a.type )
      .flatMap( a => a.usage )
      .reduce( ( obj, a ) => Object.assign( obj, { [a.type]: Decimal( obj[a.type] ?? 0 ).add( a.amount ).toNumber() } ), {} )

  },
  httpRequests: {
    total: attributes.filter( a => Attribute.HTTPRequestCount.TYPE === a.type ).length
  }
} );
