import { fetchModelsPricing } from './fetch_models_pricing.js';
import Decimal from 'decimal.js';

const M = 1_000_000;
const calcCost = ( tokens, ppm ) => Decimal( tokens ?? 0 ).div( M ).mul( ppm ).toNumber();

/**
 * Calculates the input cost based on the input value
 */
const calculateInput = ( { tokens, cost } ) =>
  !Number.isFinite( cost.input ) ? { value: null, message: 'Missing input cost' } : { value: calcCost( tokens, cost.input ) };

/**
 * Calculates the input cost based on the cache_read
 */
const calculateCachedInput = ( { tokens, cost } ) =>
  !Number.isFinite( cost.cache_read ) ? { value: null, message: 'Missing cache input cost' } : { value: calcCost( tokens, cost.cache_read ) };

/**
 * Calculates the output cost based on the output value
 */
const calculateOutput = ( { tokens, cost } ) =>
  !Number.isFinite( cost.output ) ? { value: null, message: 'Missing output' } : { value: calcCost( tokens, cost.output ) };

/**
 * Calculates the reasoning cost based on the reasoning token's
 * If there isn't reasoning costs, this means this providers doesn't differentiate reasoning vs output,
 * so don't calculate it as the price is included in output
 */
const calculateReasoning = ( { tokens, cost } ) =>
  Number.isFinite( cost.reasoning ) ? { value: calcCost( tokens, cost.reasoning ) } : undefined;

/**
 * Calculates the total cost based on the components
 */
const calculateTotal = components => Object.values( components ).reduce( ( v, e ) => v.plus( e?.value ? e.value : 0 ), Decimal( 0 ) ).toNumber();

/**
 * Calculates the cost of an llm call based on the model and usage.
 * @param {object} args
 * @param {string} args.modelId - Name of the mode, provider prefix is optional
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

    const components = {
      input: calculateInput( { tokens: nonCachedTokens, cost } ),
      cachedInput: calculateCachedInput( { tokens: cachedInputTokens, cost } ),
      output: calculateOutput( { tokens: outputTokens, cost } ),
      reasoning: calculateReasoning( { tokens: reasoningTokens ?? 0, cost } )
    };

    return { total: calculateTotal( components ), components };
  } catch ( error ) {
    console.error( 'Error calculating LLM call costs', error );
    return { total: null, message: `Error calculating LLM call costs: ${error.constructor.name} - ${error.message}` };
  }
};
