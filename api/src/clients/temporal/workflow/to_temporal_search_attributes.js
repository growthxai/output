/**
 * Converts an API search-attributes map into the (untyped) `searchAttributes` start option.
 * Scalars are wrapped in a single-element array; string arrays pass through as KeywordList values.
 *
 * @param {Record<string, string|number|boolean|string[]>} [searchAttributes]
 * @returns {{ searchAttributes?: Record<string, Array<string|number|boolean>> }} Object to spread into start options
 */
export const toTemporalSearchAttributes = searchAttributes => {
  if ( !searchAttributes || Object.keys( searchAttributes ).length === 0 ) {
    return {};
  }
  return {
    searchAttributes: Object.fromEntries(
      Object.entries( searchAttributes ).map( ( [ name, value ] ) => [ name, Array.isArray( value ) ? value : [ value ] ] )
    )
  };
};
