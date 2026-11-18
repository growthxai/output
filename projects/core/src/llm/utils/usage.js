import { extractUsageFromSteps } from './usage_tools.js';
import { parseWebSearchUsage } from './web_search.js';
import { LLMGenerationUsage, LLMGenerationUsageItem } from './attributes/llm_generation_usage.js';
import { isNonNegativeInteger, safeSum } from '#helpers/number';

/**
 * Returns usage from response or reconstruct it from steps.
 *
 * The token check is load-bearing: aborted and truncated calls still report an aggregate, but with
 * every token count undefined, and the steps are then the only record of what was already spent.
 */
const resolveUsage = ( { usage, steps } ) => {
  if ( usage && ( isNonNegativeInteger( usage.inputTokens ) || isNonNegativeInteger( usage.outputTokens ) ) ) {
    return usage;
  }
  return Array.isArray( steps ) && steps.length > 0 ? extractUsageFromSteps( steps ) : null;
};

/**
 * Converts raw AI SDK usage to LLMGenerationUsage data.
 *
 * Reads `response.usage`, falling back to the sum of `response.steps` usage when the aggregate is
 * missing tokens (truncated or failed streams). Grounding is aggregated from `response.steps`, so a
 * partial `{ steps }` response is accepted when only the steps are known.
 *
 * @param {object} args
 * @param {object} args.prompt - Output prompt with model configuration
 * @param {object} [args.usage] - AI SDK response usage
 * @param {object} [args.steps] - AI SDK response steps
 * @param {Record<string, string>} [args.toolIdsByName] - Provider tool ids keyed by configured name
 * @param {LLMRequestDetails} [args.requestDetails] - Request ids, count and duration of the whole call
 *
 * @returns {LLMGenerationUsage | null} LLM generation usage with input, output, total and detailed breakdown
 */
export const parseLLMUsage = ( { prompt, usage: usageArg = null, steps = [], toolIdsByName = null, requestDetails = null } ) => {
  const usage = resolveUsage( { usage: usageArg, steps } );
  if ( !usage ) {
    return null;
  }
  const { provider: providerId, model: modelId } = prompt.config;
  const { inputTokens, inputTokenDetails, outputTokens, outputTokenDetails } = usage;
  const { noCacheTokens, cacheReadTokens, cacheWriteTokens } = inputTokenDetails ?? {};
  const { textTokens, reasoningTokens } = outputTokenDetails ?? {};

  const items = [];

  if ( isNonNegativeInteger( inputTokens ) ) {
    // the sum of the components must be equal to the tokens
    const useDetails = inputTokens > 0 && safeSum( noCacheTokens, cacheReadTokens, cacheWriteTokens ) === inputTokens;
    const group = LLMGenerationUsageItem.Group.INPUT;

    if ( useDetails ) {
      if ( isNonNegativeInteger( noCacheTokens ) ) {
        items.push( new LLMGenerationUsageItem( group, 'no_cache', noCacheTokens ) );
      }
      if ( isNonNegativeInteger( cacheReadTokens ) ) {
        items.push( new LLMGenerationUsageItem( group, 'cache_read', cacheReadTokens ) );
      }
      if ( isNonNegativeInteger( cacheWriteTokens ) ) {
        items.push( new LLMGenerationUsageItem( group, 'cache_write', cacheWriteTokens ) );
      }
    } else {
      items.push( new LLMGenerationUsageItem( group, null, inputTokens ) );
    }
  }

  if ( isNonNegativeInteger( outputTokens ) ) {
    // the sum of the components must be equal to the tokens
    const useDetails = outputTokens > 0 && safeSum( textTokens, reasoningTokens ) === outputTokens;
    const group = LLMGenerationUsageItem.Group.OUTPUT;

    if ( useDetails ) {
      if ( isNonNegativeInteger( textTokens ) ) {
        items.push( new LLMGenerationUsageItem( group, 'text', textTokens ) );
      }
      if ( isNonNegativeInteger( reasoningTokens ) ) {
        items.push( new LLMGenerationUsageItem( group, 'reasoning', reasoningTokens ) );
      }
    } else {
      items.push( new LLMGenerationUsageItem( group, null, outputTokens ) );
    }
  }

  // Provider web search is billed per step, so aggregate across every step rather than only the final one.
  if ( Array.isArray( steps ) ) {
    const webSearch = steps.flatMap( step => parseWebSearchUsage( providerId, modelId, step, toolIdsByName ) );
    if ( webSearch.length > 0 ) {
      const totals = Map.groupBy( webSearch, item => item.label );
      for ( const [ label, values ] of totals ) {
        const amount = values.reduce( ( sum, item ) => sum + item.amount, 0 );
        items.push( new LLMGenerationUsageItem( LLMGenerationUsageItem.Group.TOOLS, label, amount ) );
      }
    }
  }

  if ( items.length === 0 ) {
    return null;
  }

  return new LLMGenerationUsage( modelId, providerId, prompt.name, requestDetails, items );
};
