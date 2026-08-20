import { createHash } from 'node:crypto';

/** Builds the final source shape */
const buildSource = ( { url, title } ) => {
  const trimmedUrl = url.trim();
  return {
    type: 'source',
    sourceType: 'url',
    id: createHash( 'sha256' ).update( trimmedUrl ).digest( 'hex' ).slice( 0, 16 ),
    url: trimmedUrl,
    title: title ?? ''
  };
};

/** Return value it is array, otherwise return [] */
const asArray = v => Array.isArray( v ) ? v : [];

/**
 * Extracts source URLs from search tool results embedded in AI SDK step data.
 *
 * Detects any tool result containing a `results[]` array whose items have a `url` string field.
 * This covers perplexitySearch, tavilySearch, exaSearch, and any future tool with the same shape.
 *
 * @param {Array} steps - AI SDK response steps (response.steps)
 * @returns {Array<{ type: string, sourceType: string, id: string, url: string, title: string }>}
 */
const extractSourcesFromSteps = steps =>
  asArray( steps )
    .flatMap( step => asArray( step?.toolResults ) )
    .flatMap( toolResult => asArray( toolResult?.output?.results ) )
    .filter( item => typeof item?.url === 'string' && !!item.url.trim() )
    .map( v => buildSource( v ) );

/**
 * Extract sources from tools usage and final response, deduplicate by url and return.
 *
 * Response sources are preferred over tools when deduplicating.
 *
 * @param {object} response AI SDK response
 * @returns {object[]} Merged sources
 */
export const extractSources = response => {
  const { steps, sources: sourcesFromResponse } = response;
  const sourcesFromTools = extractSourcesFromSteps( steps );
  const allSources = sourcesFromTools.concat( asArray( sourcesFromResponse ) );
  return new Map( allSources.map( s => [ s.url, s ] ) ).values().toArray();
};
