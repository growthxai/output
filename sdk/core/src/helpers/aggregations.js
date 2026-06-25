import { Attribute } from '#trace_attribute';
import Decimal from 'decimal.js';

/**
 * @typedef {object} Aggregation
 *
 * @property {object} cost
 * @property {object} cost.total - Total cost
 * @property {object} tokens
 * @property {object} tokens.total - Total tokens used
 * @property {object} tokens.input  - Total input tokens used
 * @property {object} tokens.input_cached - Total cached input tokens used
 * @property {object} tokens.output - Total output tokens used
 * @property {object} tokens.reasoning - Total reasoning tokens used
 * @property {object} httpRequests
 * @property {object} httpRequests.total - Total number of http requests made
 */
/**
 * Aggregates a collection of Attributes into a object with totals
 *
 * @param {Attribute} attributes
 * @returns {Aggregation} aggregation object
 */
export const aggregateAttributes = attributes => ( {
  cost: {
    total: attributes
      .filter( a => [ Attribute.HTTPRequestCost.TYPE, Attribute.LLMUsage.TYPE ].includes( a.type ) )
      .reduce( ( sum, a ) => sum.add( a.total ), Decimal( 0 ) ).toNumber()
  },
  tokens: {
    total: attributes
      .filter( a => Attribute.LLMUsage.TYPE === a.type )
      .reduce( ( sum, a ) => sum.add( a.tokensUsed ), Decimal( 0 ) ).toNumber(),
    ...Object.entries( attributes
      .filter( a => Attribute.LLMUsage.TYPE === a.type )
      .flatMap( a => a.usage )
      .reduce( ( obj, a ) => Object.assign( obj, { [a.type]: ( obj[a.type] ?? Decimal( 0 ) ).add( a.amount ) } ), {} ) )
      .reduce( ( obj, [ k, v ] ) => Object.assign( obj, { [k]: v.toNumber() } ), {} ) // convert all values to number

  },
  httpRequests: {
    total: attributes.filter( a => Attribute.HTTPRequestCount.TYPE === a.type ).length
  }
} );
