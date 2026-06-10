import { fetchModelsPricing } from './fetch_models_pricing.js';
import { Tracing } from '@outputai/core/sdk_activity_integration';

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
      console.warn( 'Failed to fetch models pricing' );
      return null;
    }

    const pricing = models.get( modelId );
    if ( !pricing ) {
      console.warn( 'Missing cost reference for model' );
      return null;
    }

    const { inputTokens, cachedInputTokens, outputTokens, reasoningTokens } = usage;

    const nonCachedTokens = inputTokens - ( cachedInputTokens ?? 0 );

    const llmUsage = new Tracing.Attribute.LLMUsage( modelId );

    if ( Number.isFinite( pricing.input ) && Number.isFinite( nonCachedTokens ) ) {
      llmUsage.addUsage( { type: 'input', ppm: pricing.input, amount: nonCachedTokens } );
    }
    // Surface cached input tokens whenever the provider reports them, even if the model's
    // pricing lacks a cache_read rate — otherwise caching savings vanish from the token
    // aggregation (these tokens are already excluded from the input line above). Price at
    // cache_read when available, otherwise at 0.
    if ( Number.isFinite( cachedInputTokens ) ) {
      const cacheReadPpm = Number.isFinite( pricing.cache_read ) ? pricing.cache_read : 0;
      llmUsage.addUsage( { type: 'input_cached', ppm: cacheReadPpm, amount: cachedInputTokens } );
    }
    if ( Number.isFinite( pricing.output ) && Number.isFinite( outputTokens ) ) {
      llmUsage.addUsage( { type: 'output', ppm: pricing.output, amount: outputTokens } );
    }
    // When there are no reasoning costs, providers do not differentiate reasoning vs output, so the price is included in the output
    if ( Number.isFinite( pricing.reasoning ) && Number.isFinite( reasoningTokens ) ) {
      llmUsage.addUsage( { type: 'reasoning', ppm: pricing.reasoning, amount: reasoningTokens } );
    }

    return llmUsage;
  } catch ( error ) {
    console.error( 'Error calculating LLM call costs', error );
    return null;
  }
};
