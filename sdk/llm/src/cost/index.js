import { fetchModelsPricing } from './fetch_models_pricing.js';
import { Tracing } from '@outputai/core/sdk_activity_integration';

// Extracts cache-write tokens from provider-specific metadata. Anthropic
// surfaces them under `providerMetadata.anthropic.cacheCreationInputTokens`;
// other providers either don't expose writes (OpenAI auto prefix caching) or
// haven't been wired yet.
const readCacheWriteTokens = providerMetadata => {
  const anthropic = providerMetadata?.anthropic?.cacheCreationInputTokens;
  if ( Number.isFinite( anthropic ) ) {
    return anthropic;
  }
  return null;
};

/**
 * Calculates the cost of an llm call based on the model and usage.
 * @param {object} args
 * @param {string} args.modelId - Name of the model, provider prefix is optional
 * @param {object} args.usage - Usage, as returned from AI SDK
 * @param {object} [args.providerMetadata] - Provider-specific metadata from the AI SDK response. Used to bill cache-write tokens.
 * @returns {object} The cost with total value and components
 */
export const calculateLLMCallCost = async ( { modelId, usage, providerMetadata } ) => {
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
    const cacheWriteTokens = readCacheWriteTokens( providerMetadata );

    const nonCachedTokens = inputTokens - ( cachedInputTokens ?? 0 ) - ( cacheWriteTokens ?? 0 );

    const llmUsage = new Tracing.Attribute.LLMUsage( modelId );

    if ( Number.isFinite( pricing.input ) && Number.isFinite( nonCachedTokens ) ) {
      llmUsage.addUsage( { type: 'input', ppm: pricing.input, amount: nonCachedTokens } );
    }
    if ( Number.isFinite( pricing.cache_read ) && Number.isFinite( cachedInputTokens ) ) {
      llmUsage.addUsage( { type: 'input_cached', ppm: pricing.cache_read, amount: cachedInputTokens } );
    }
    if ( Number.isFinite( cacheWriteTokens ) ) {
      const writePpm = Number.isFinite( pricing.cache_write ) ? pricing.cache_write : pricing.input;
      if ( Number.isFinite( writePpm ) ) {
        llmUsage.addUsage( { type: 'input_cache_write', ppm: writePpm, amount: cacheWriteTokens } );
      }
    }
    if ( Number.isFinite( pricing.output ) && Number.isFinite( outputTokens ) ) {
      llmUsage.addUsage( { type: 'output', ppm: pricing.output, amount: outputTokens } );
    }
    // When there aren't reasoning costs, the providers doesn't differentiate reasoning vs output, so the price is included in the output
    if ( Number.isFinite( pricing.reasoning ) && Number.isFinite( reasoningTokens ) ) {
      llmUsage.addUsage( { type: 'reasoning', ppm: pricing.reasoning, amount: reasoningTokens } );
    }

    return llmUsage;
  } catch ( error ) {
    console.error( 'Error calculating LLM call costs', error );
    return null;
  }
};
