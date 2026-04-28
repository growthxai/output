import { fetchModelsPricing } from './fetch_models_pricing.js';
import Decimal from 'decimal.js';

const M = 1_000_000;
const calcCost = ( tokens, ppm ) => Decimal( tokens ?? 0 ).div( M ).mul( ppm ).toNumber();

/**
 * Calculates the cost of an llm call based on the model and usage.
 * @param {object} args
 * @param {string} args.modelId - Name of the model, provider prefix is optional
 * @param {object} args.usage - Usage, as returned from AI SDK
 * @returns {object} The cost with total value and components
 */
export const calculateLLMCallCost = async ( { modelId, usage } ) => {
  try {
    const models = await fetchModelsPricing();
    if ( !models ) {
      return { total: null, message: 'Failed to fetch models pricing' };
    }

    const cost = models.get( modelId );
    if ( !cost ) {
      return { total: null, message: 'Missing cost reference for model' };
    }

    const { inputTokens, cachedInputTokens, outputTokens, reasoningTokens } = usage;

    const nonCachedTokens = inputTokens - ( cachedInputTokens ?? 0 );

    const components = [
      Number.isFinite( cost.input ) ? { name: 'input_tokens', value: calcCost( nonCachedTokens, cost.input ) } : false,
      Number.isFinite( cost.cache_read ) ? { name: 'input_cached_tokens', value: calcCost( cachedInputTokens, cost.cache_read ) } : false,
      Number.isFinite( cost.output ) ? { name: 'output_tokens', value: calcCost( outputTokens, cost.output ) } : false,
      /* When there aren't reasoning costs, the providers doesn't differentiate reasoning vs output, so the price is included in the output */
      Number.isFinite( cost.reasoning ) ? { name: 'reasoning_tokens', value: calcCost( reasoningTokens, cost.reasoning ) } : false
    ].filter( v => !!v );
    return { total: components.reduce( ( v, e ) => v.plus( e.value ), Decimal( 0 ) ).toNumber(), components };
  } catch ( error ) {
    console.error( 'Error calculating LLM call costs', error );
    return { total: null, message: `Error calculating LLM call costs: ${error.constructor.name} - ${error.message}` };
  }
};
