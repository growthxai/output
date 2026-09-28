const serializeValue = value => value instanceof Date ? value.toISOString() : value;

/**
 * Converts Datetime (Date) search attribute values to ISO strings so the result survives JSON and structured-clone boundaries identically.
 *
 * @param {Record<string, unknown[]>} [searchAttributes] Temporal untyped search attributes
 * @returns {Record<string, Array<string|number|boolean>>|undefined}
 */
export const serializeSearchAttributes = searchAttributes =>
  searchAttributes ?
    Object.fromEntries( Object.entries( searchAttributes ).map( ( [ k, values ] ) => [ k, values.map( serializeValue ) ] ) ) :
    undefined;

const isSystemAttribute = name => name.startsWith( 'Temporal' ) || name === 'BuildIds';

/**
 * Drops Temporal system search attributes so the rest can be forwarded to child workflows.
 *
 * @param {Record<string, unknown[]>} [searchAttributes] Temporal untyped search attributes
 * @returns {Record<string, unknown[]>|undefined} Undefined when nothing remains
 */
export const inheritableSearchAttributes = searchAttributes => {
  const entries = Object.entries( searchAttributes ?? {} ).filter( ( [ k ] ) => !isSystemAttribute( k ) );
  return entries.length ? Object.fromEntries( entries ) : undefined;
};
