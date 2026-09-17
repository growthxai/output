import { createHash } from 'node:crypto';
import { Logger } from '@outputai/core';

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

const isNonBlankUrl = url => typeof url === 'string' && url.trim().length > 0;

/**
 * Extracts source from search tool results embedded in AI SDK step data.
 *
 * Detects any tool result containing a `results[]` array whose items have a `url` string field.
 * This covers perplexitySearch, tavilySearch, exaSearch, and any future tool with the same shape.
 * Deduplicate key is "url"
 *
 * @param {Array} steps - AI SDK response steps (response.steps)
 * @returns {Array<{ key: string, source: object }>}
 */
const extractSourcesFromSteps = steps =>
  asArray( steps )
    .flatMap( step => asArray( step?.toolResults ) )
    .flatMap( toolResult => asArray( toolResult?.output?.results ) )
    .filter( item => isNonBlankUrl( item?.url ) )
    .map( item => buildSource( item ) )
    .map( item => ( { key: item.url, source: item } ) );

/**
 * Extract only the valid sources from the response (has url or id).
 * Deduplicate key is `url` when set, otherwise `id` (document sources have `id` and no `url`).
 *
 * @param {Array} sources
 * @returns {Array<{ key: string, source: object }>}
 */
const extractValidSourcesFromResponse = sources =>
  asArray( sources )
    .filter( item => item !== null && typeof item === 'object' )
    .filter( item => isNonBlankUrl( item.url ) || typeof item.id === 'string' )
    .map( item => {
      const itemCopy = { ...item };
      if ( isNonBlankUrl( itemCopy.url ) ) {
        itemCopy.url = itemCopy.url.trim();
      } else {
        delete itemCopy.url;
      }
      return itemCopy;
    } )
    .map( item => ( { key: item.url ?? item.id, source: item } ) );

/** Deduplicate wrapped sources by their key */
const deduplicateSources = sources => new Map( sources.map( item => [ item.key, item.source ] ) ).values().toArray();

/**
 * Extract sources from tools usage and final response, deduplicate, and return.
 * Response sources are preferred over tools when the key matches.
 *
 * @param {object} response AI SDK response
 * @returns {object[]} Merged sources
 */
export const extractSources = response => {
  try {
    const { steps, sources: sourcesFromResponse } = response ?? {};
    const sourcesFromTools = extractSourcesFromSteps( asArray( steps ) );
    const validSourcesFromResponse = extractValidSourcesFromResponse( sourcesFromResponse );
    return deduplicateSources( sourcesFromTools.concat( validSourcesFromResponse ) );
  } catch ( error ) {
    Logger.error( 'Sources extraction failed', { namespace: 'LLM', error: error?.message || String( error ) } );
    return [];
  }
};
