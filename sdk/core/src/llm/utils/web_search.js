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

/**
 * Extracts provider web search requests from one AI SDK step.
 *
 * @param {string} providerId - Provider that produced the response
 * @param {object} step - AI SDK step
 * @param {Record<string, string>} [toolIdsByName] - Provider tool ids keyed by configured name
 * @returns {{ label: string, amount: number } | null} Search usage, or null when no search was billed
 */
export const parseWebSearchUsage = ( providerId, step, toolIdsByName ) => {
  if ( providerId === 'anthropic' ) {
    const amount = step?.providerMetadata?.anthropic?.usage?.server_tool_use?.web_search_requests;
    return Number.isSafeInteger( amount ) && amount > 0 ? { label: 'web_search', amount } : null;
  }

  if ( providerId !== 'openai' || !Array.isArray( step?.content ) ) {
    return null;
  }

  const amount = step.content.filter( part =>
    part?.type === 'tool-call' &&
    part.providerExecuted === true &&
    toolIdsByName?.[part.toolName] === 'openai.web_search'
  ).length;

  return amount > 0 ? { label: 'web_search', amount } : null;
};
