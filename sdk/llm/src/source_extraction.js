import { createHash } from 'node:crypto';

/**
 * Checks whether a tool result looks like a search response (has a `results` array with `url` strings).
 */
const isSearchResult = result => !!result?.results?.[0]?.url;

const toSource = ( { url, title } ) => ( {
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
 * Best-effort: returns empty array on any error rather than throwing.
 *
 * @param {Array} steps - AI SDK response steps (response.steps)
 * @returns {Array<{ type: string, sourceType: string, id: string, url: string, title: string }>}
 */
export function extractSourcesFromSteps( steps ) {
  try {
    if ( !Array.isArray( steps ) || steps.length === 0 ) {
      return [];
    }

    const seen = new Set();
    return steps
      .flatMap( step => Array.isArray( step.toolResults ) ? step.toolResults : [] )
      .flatMap( toolResult => isSearchResult( toolResult.output ) ? toolResult.output.results : [] )
      .filter( item => {
        if ( !item.url || seen.has( item.url ) ) {
          return false;
        }
        seen.add( item.url );
        return true;
      } )
      .map( toSource );
  } catch ( error ) {
    console.warn( '[output-llm] source extraction failed, returning empty sources', error );
    return [];
  }
}
