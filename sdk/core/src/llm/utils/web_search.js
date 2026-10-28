/**
 * Provider web search rates, expressed per million requests to match `ppm` semantics.
 * Verified 2026-10-27:
 * - https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool
 * - https://openai.com/api/pricing/
 */
export const WebSearchPpmMap = new Map( [
  [ 'anthropic/web_search', 10_000 ],
  [ 'openai/web_search', 10_000 ]
] );

export const OpenAiReasoningWebSearchPpmMap = new Map( [
  [ true, 10_000 ],
  [ false, 25_000 ],
  [ undefined, null ]
] );

/**
 * Resolves a provider web search rate.
 *
 * OpenAI preview search pricing depends on whether the selected model is a reasoning model.
 *
 * @param {string} providerId
 * @param {string} label
 * @param {{ cost: object, reasoning: boolean }} [modelPricing] - Model pricing record from models.dev
 * @returns {number | null} Price per million requests
 */
export const resolveWebSearchPpm = ( providerId, label, modelPricing ) => {
  if ( WebSearchPpmMap.has( `${providerId}/${label}` ) ) {
    return WebSearchPpmMap.get( `${providerId}/${label}` );
  }

  if ( providerId === 'openai' && label === 'web_search_preview' ) {
    return OpenAiReasoningWebSearchPpmMap.get( modelPricing?.reasoning );
  }

  return null;
};

/**
 * Extracts provider web search requests from one AI SDK step.
 *
 * @param {string} providerId - Provider that produced the response
 * @param {object} step - AI SDK step
 * @param {Record<string, string>} [toolIdsByName] - Provider tool ids keyed by configured name
 * @returns {Array<{ label: string, amount: number }>} Search usage grouped by tool type
 */
export const parseWebSearchUsage = ( providerId, step, toolIdsByName ) => {
  if ( providerId === 'anthropic' ) {
    const amount = step?.providerMetadata?.anthropic?.usage?.server_tool_use?.web_search_requests;
    return Number.isSafeInteger( amount ) && amount > 0 ? [ { label: 'web_search', amount } ] : [];
  }

  if ( providerId !== 'openai' || !Array.isArray( step?.content ) ) {
    return [];
  }

  return step.content
    .filter( p =>
      p?.type === 'tool-call' &&
      p.providerExecuted === true &&
      toolIdsByName?.[p.toolName]?.startsWith( 'openai.web_search' )
    )
    .reduce( ( map, part ) => {
      const label = toolIdsByName[part.toolName].replace( /^openai\./, '' );
      return map.set( label, ( map.get( label ) ?? 0 ) + 1 );
    }, new Map() )
    .entries()
    .toArray()
    .map( ( [ label, amount ] ) => ( { label, amount } ) );
};
