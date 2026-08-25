import { fetchModelsPricing } from './fetch_models_pricing.js';
import { Tracing } from '@outputai/core/sdk/runtime';
import { Logger } from '@outputai/core';

const exists = v => Number.isFinite( v );

const safeSum = ( ...values ) => values.filter( exists ).reduce( ( t, v ) => t + v, 0 );

/**
 * Calculates the cost of an llm call based on the model and usage.
 * @param {object} args
 * @param {string} args.providerId - Id of the provider
 * @param {string} args.modelId - Id of the model
 * @param {object} args.usage - AI SDK usage with aggregate token counts and optional input/output token details
 * @returns {object | null} LLM usage with `input`, cache, `output`, and reasoning entries, or null when pricing is unavailable
 */
export const calculateLLMCallCost = async ( { providerId, modelId, usage } ) => {
  try {
    const models = await fetchModelsPricing();

    if ( !models ) {
      Logger.warn( 'Failed to fetch models pricing', { namespace: 'LLM' } );
      return null;
    }

    const pricing = models.get( `${providerId}/${modelId}` );
    if ( !pricing ) {
      Logger.warn( 'Missing cost reference for model', { namespace: 'LLM', modelId, providerId } );
      return null;
    }

    const { inputTokens, inputTokenDetails, outputTokens, outputTokenDetails } = usage;
    const { noCacheTokens, cacheReadTokens, cacheWriteTokens } = inputTokenDetails ?? {};
    const { textTokens, reasoningTokens } = outputTokenDetails ?? {};

    const llmUsage = new Tracing.Attribute.LLMUsage( modelId );

    if ( exists( pricing.input ) && exists( inputTokens ) ) {

      // the sum of the components must be equal to the tokens
      const useDetails = inputTokens > 0 && safeSum( noCacheTokens, cacheReadTokens, cacheWriteTokens ) === inputTokens;

      if ( useDetails ) {
        if ( exists( noCacheTokens ) ) {
          llmUsage.addUsage( { type: 'input', ppm: pricing.input, amount: noCacheTokens } );
        }

        // When the pricing table doesn't have cache pricing, fallback to input price
        if ( exists( cacheReadTokens ) ) {
          llmUsage.addUsage( { type: 'input_cache_read', ppm: pricing.cache_read ?? pricing.input, amount: cacheReadTokens } );
        }
        if ( exists( cacheWriteTokens ) ) {
          llmUsage.addUsage( { type: 'input_cache_write', ppm: pricing.cache_write ?? pricing.input, amount: cacheWriteTokens } );
        }
      } else {
        llmUsage.addUsage( { type: 'input', ppm: pricing.input, amount: inputTokens } );
      }
    }

    if ( exists( pricing.output ) && exists( outputTokens ) ) {

      // the sum of the components must be equal to the tokens
      const useDetails = outputTokens > 0 && safeSum( textTokens, reasoningTokens ) === outputTokens;

      if ( useDetails ) {
        if ( exists( textTokens ) ) {
          llmUsage.addUsage( { type: 'output', ppm: pricing.output, amount: textTokens } );
        }
        // When the pricing table doesn't have reasoning pricing, fallback to output price
        if ( exists( reasoningTokens ) ) {
          llmUsage.addUsage( { type: 'output_reasoning', ppm: pricing.reasoning ?? pricing.output, amount: reasoningTokens } );
        }
      } else {
        llmUsage.addUsage( { type: 'output', ppm: pricing.output, amount: outputTokens } );
      }
    }

    return llmUsage.usage.length > 0 ? llmUsage : null;
  } catch ( error ) {
    Logger.error( 'Error calculating LLM call costs', { error: error.message, namespace: 'LLM' } );
    return null;
  }
};
