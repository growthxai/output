const GEMINI_3_GOOGLE_SEARCH_PPM = 14_000;

const getQueryCount = providerMetadata => {
  if ( !providerMetadata || typeof providerMetadata !== 'object' ) {
    return 0;
  }
  for ( const provider of [ 'vertex', 'google' ] ) {
    const queries = providerMetadata[provider]?.groundingMetadata?.webSearchQueries;
    if ( Array.isArray( queries ) ) {
      return queries.length;
    }
  }
  return 0;
};

/**
 * Return Gemini 3 Google Search grounding as a priced, non-token usage item.
 * Google bills each search query at $14/1K after the account-level free tier;
 * cost telemetry intentionally reports list price, as it does for model tokens.
 */
export const getGoogleSearchGroundingUsage = ( { modelId, providerMetadata, steps } ) => {
  if ( !String( modelId ).includes( 'gemini-3' ) ) {
    return null;
  }

  const searchQueries = Array.isArray( steps ) && steps.length > 0 ?
    steps.reduce( ( total, step ) => total + getQueryCount( step?.providerMetadata ), 0 ) :
    getQueryCount( providerMetadata );

  if ( searchQueries === 0 ) {
    return null;
  }

  return {
    type: 'google_search_grounding',
    unit: 'query',
    ppm: GEMINI_3_GOOGLE_SEARCH_PPM,
    amount: searchQueries
  };
};
