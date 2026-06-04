import { createHash } from 'node:crypto';

/**
 * Checks whether a tool result looks like a search response (has a `results` array with `url` strings).
 */
const isSearchResult = v => Array.isArray( v?.results ) && v.results.some( r => typeof r?.url === 'string' );

/**
 * Builds the final source shape
 * @param {object} args
 * @param {string} args.url
 * @param {string} args.title
 * @returns {object} final object
 */
const buildSource = ( { url, title } ) => ( {
  type: 'source',
  sourceType: 'url',
  id: createHash( 'sha256' ).update( url ).digest( 'hex' ).slice( 0, 16 ),
  url,
  title: title ?? ''
} );

/**
 * Extracts source URLs from search tool results embedded in AI SDK step data.
 *
 * Detects any tool result containing a `results[]` array whose items have a `url` string field.
 * This covers perplexitySearch, tavilySearch, exaSearch, and any future tool with the same shape.
 *
 * @param {Array} steps - AI SDK response steps (response.steps)
 * @returns {Array<{ type: string, sourceType: string, id: string, url: string, title: string }>}
 */
export const extractSourcesFromSteps = steps =>
  ( Array.isArray( steps ) ? steps : [] )
    .flatMap( step => Array.isArray( step?.toolResults ) ? step.toolResults : [] )
    .flatMap( toolResult => isSearchResult( toolResult?.output ) ? toolResult.output.results : [] )
    .filter( item => typeof item?.url === 'string' && item.url.length > 0 ) // Ignore non string or empty string urls
    .reduce( ( map, v ) => map.has( v.url ) ? map : map.set( v.url, v ), new Map() ) // deduplicate, by keeping first entry
    .values().toArray()
    .map( v => buildSource( v ) );

/**
 * Merge sources used tools and sources from AI SDK response into a single list
 *
 * Deduplicate by url (prefer to keep items from sources from response).
 *
 * @param {object} args
 * @param {object[]} args.sourcesFromTools
 * @param {object[]} args.sourcesFromResponse
 * @returns {object[]} Merged sources
 */
export const combineSources = ( { sourcesFromTools, sourcesFromResponse } ) =>
  new Map( sourcesFromTools.concat( Array.isArray( sourcesFromResponse ) ? sourcesFromResponse : [] )
    .map( s => [ s.url, s ] ) ).values().toArray();
