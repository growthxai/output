/*
 * Provider web search rates, expressed per million billing units to match `ppm` semantics.
 */
const Price = {
  // Verified: 2026-10-28 / Source: https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool
  ANTHROPIC_WEB_SEARCH: 10_000,
  // Verified: 2026-10-28 / Source: https://openai.com/api/pricing/
  OPENAI_WEB_SEARCH: 10_000,
  // Verified: 2026-10-28 / Source: https://openai.com/api/pricing/
  OPENAI_WEB_SEARCH_PREVIEW: 25_000,
  // Verified: 2026-10-28 / Source: https://openai.com/api/pricing/
  OPENAI_WEB_SEARCH_PREVIEW_REASONING: 10_000,
  // Verified: 2026-10-28 / Source: https://cloud.google.com/vertex-ai/generative-ai/pricing
  GOOGLE_GROUNDING_QUERY: 14_000
};

const Label = {
  WEB_SEARCH: 'web_search',
  WEB_SEARCH_PREVIEW: 'web_search_preview',
  WEB_SEARCH_UNKNOWN: 'web_search_unknown',
  GROUNDING_GENERIC: 'grounding',
  GROUNDING_QUERY: 'grounding_query'
};

const Tool = {
  OPENAI_WEB_SEARCH: 'openai.web_search',
  OPENAI_WEB_SEARCH_PREVIEW: 'openai.web_search_preview'
};

// Google reports generated queries in grounding metadata. Supported Gemini 3/4 models bill per query.
const parseGoogleGroundingUsage = ( modelId, providerMetadata ) => {
  const meta = providerMetadata?.vertex ?? providerMetadata?.google;
  const queries = meta?.groundingMetadata?.webSearchQueries;
  if ( !Array.isArray( queries ) || queries.length === 0 ) {
    return [];
  }

  if ( /^gemini-[34]/.test( modelId ) ) {
    return [ { label: Label.GROUNDING_QUERY, amount: queries.length } ];
  }

  return [ { label: Label.GROUNDING_GENERIC, amount: queries.length } ];
};

// Anthropic reports the billable request count directly in server-tool usage metadata.
const parseAnthropicWebSearchUsage = step => {
  const amount = step?.providerMetadata?.anthropic?.usage?.server_tool_use?.web_search_requests;
  return Number.isSafeInteger( amount ) && amount > 0 ? [ { label: Label.WEB_SEARCH, amount } ] : [];
};

/*
 * OpenAI bills only `search` result actions, not page opens or in-page finds. Tool names are user
 * aliases, so canonical IDs come from `toolIdsByName`. When both variants are configured, AI SDK
 * maps every result to the first variant and the billed variant cannot be determined.
 */
const parseOpenAiWebSearchUsage = ( step, toolIdsByName ) => {
  if ( !Array.isArray( step?.content ) ) {
    return [];
  }

  const isSearch = p => p?.type === 'tool-result' && p.output?.action?.type === 'search';

  const searchTools = [ Tool.OPENAI_WEB_SEARCH, Tool.OPENAI_WEB_SEARCH_PREVIEW ];

  const mixedToolsAvailable = new Set( Object.values( toolIdsByName ).filter( id => searchTools.includes( id ) ) ).size > 1;

  const webSearches = step.content.filter( p => isSearch( p ) && toolIdsByName[p.toolName] === Tool.OPENAI_WEB_SEARCH ).length;

  const webSearchPreviews = step.content.filter( p => isSearch( p ) && toolIdsByName[p.toolName] === Tool.OPENAI_WEB_SEARCH_PREVIEW ).length;

  // Mixed configurations prove a search ran, but not which available variant OpenAI billed.
  if ( mixedToolsAvailable && webSearches + webSearchPreviews > 0 ) {
    return [ { label: Label.WEB_SEARCH_UNKNOWN, amount: webSearches + webSearchPreviews } ];
  }

  if ( webSearches > 0 ) {
    return [ { label: Label.WEB_SEARCH, amount: webSearches } ];
  }

  if ( webSearchPreviews > 0 ) {
    return [ { label: Label.WEB_SEARCH_PREVIEW, amount: webSearchPreviews } ];
  }

  return [];
};

/**
 * Extracts provider web search requests from one AI SDK step.
 *
 * @param {string} providerId - Provider that produced the response
 * @param {string} modelId - Model that produced the response
 * @param {object} step - AI SDK step
 * @param {Record<string, string>} [toolIdsByName] - Provider tool ids keyed by configured name
 * @returns {Array<{ label: string, amount: number }>} Search usage grouped by tool type
 */
export const parseWebSearchUsage = ( providerId, modelId, step, toolIdsByName ) => {
  if ( providerId === 'google-vertex' ) {
    return parseGoogleGroundingUsage( modelId, step?.providerMetadata );
  }
  if ( providerId === 'anthropic' ) {
    return parseAnthropicWebSearchUsage( step );
  }
  if ( providerId === 'openai' && toolIdsByName ) {
    return parseOpenAiWebSearchUsage( step, toolIdsByName );
  }
  return [];
};

/**
 * Resolves a provider web search rate.
 *
 * OpenAI preview search pricing depends on whether the selected model is a reasoning model.
 *
 * @param {string} providerId
 * @param {string} label
 * @param {{ cost: object, reasoning: boolean }} [modelPricing] - Model pricing record from models.dev
 * @returns {number | null} Price per million requests, queries, or prompts
 */
export const resolveWebSearchPpm = ( providerId, label, modelPricing ) => {
  if ( providerId === 'google-vertex' && label === Label.GROUNDING_QUERY ) {
    return Price.GOOGLE_GROUNDING_QUERY;
  }

  if ( providerId === 'openai' ) {
    if ( label === Label.WEB_SEARCH ) {
      return Price.OPENAI_WEB_SEARCH;
    }
    if ( label === Label.WEB_SEARCH_PREVIEW && modelPricing?.reasoning === false ) {
      return Price.OPENAI_WEB_SEARCH_PREVIEW;
    }
    if ( label === Label.WEB_SEARCH_PREVIEW && modelPricing?.reasoning === true ) {
      return Price.OPENAI_WEB_SEARCH_PREVIEW_REASONING;
    }
    return null;
  }

  if ( providerId === 'anthropic' && label === Label.WEB_SEARCH ) {
    return Price.ANTHROPIC_WEB_SEARCH;
  }

  return null;
};
