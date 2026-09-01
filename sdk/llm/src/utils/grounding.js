/**
 * Grounding with Google Search is billed per request, not per token, and models.dev carries no
 * per-request rate, so the table lives here. Gemini 3 bills per Grounding Query; Gemini 2.x bills
 * per Grounding Prompt, once, regardless of query count. Different units, so the family decides
 * both the label and the amount. Rates are price-per-million to match `ppm` semantics.
 * Verified 2026-09-01: https://cloud.google.com/vertex-ai/generative-ai/pricing
 */
const UNITS = [
  { match: /^gemini-3/, label: 'grounding_query', ppm: 14_000 },
  { match: /^gemini-2/, label: 'grounding_prompt', ppm: 35_000 }
];

/**
 * Unknown family: still record the quantity so the call is visibly unpriced rather than silently
 * token-only. No rate resolves for this label, so the item lands MISSING and the cost attribute
 * goes INCOMPLETE.
 */
export const GROUNDING_UNKNOWN_LABEL = 'grounding';

export const GROUNDING_PPM = Object.fromEntries( UNITS.map( u => [ u.label, u.ppm ] ) );

export const isGroundingLabel = label => label === GROUNDING_UNKNOWN_LABEL || label in GROUNDING_PPM;

/**
 * Extracts the billable grounding quantity from provider metadata.
 *
 * Counts web-search grounding only. `groundingMetadata` also carries `imageSearchQueries` and
 * `retrievalQueries`, which bill on their own terms; neither appears in current traffic. Extend
 * here if image or retrieval grounding is enabled.
 *
 * @param {string} modelId - Id of the model that produced the response
 * @param {object} [providerMetadata] - AI SDK provider metadata of the final step
 * @returns {{ label: string, amount: number } | null} Grounding label and amount, or null when ungrounded
 */
export const parseGroundingUsage = ( modelId, providerMetadata ) => {
  const meta = providerMetadata?.vertex ?? providerMetadata?.google;
  const queries = meta?.groundingMetadata?.webSearchQueries;
  if ( !Array.isArray( queries ) || queries.length === 0 ) {
    return null;
  }

  const unit = UNITS.find( u => u.match.test( modelId ) );
  if ( !unit ) {
    return { label: GROUNDING_UNKNOWN_LABEL, amount: queries.length };
  }

  return {
    label: unit.label,
    amount: unit.label === 'grounding_query' ? queries.length : 1
  };
};
