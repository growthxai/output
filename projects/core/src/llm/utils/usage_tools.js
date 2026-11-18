const sum = ( a, b ) => {
  if ( Number.isFinite( a ) ) {
    return a + ( Number.isFinite( b ) ? b : 0 );
  } else {
    return Number.isFinite( b ) ? b : undefined;
  }
};

const isPlainObject = value => value !== null && typeof value === 'object';

/** Deep numeric merge of two AI SDK usage objects; `raw` is provider-shaped and never summed */
const mergeUsage = ( total, usage ) => Object.entries( usage )
  .filter( ( [ key ] ) => key !== 'raw' )
  .reduce( ( merged, [ key, value ] ) => ( {
    ...merged,
    [key]: isPlainObject( value ) ? mergeUsage( merged[key] ?? {}, value ) : sum( merged[key], value )
  } ), total );

/** Sums per-step AI SDK usage */
export const extractUsageFromSteps = steps => steps
  .map( step => step?.usage )
  .filter( Boolean )
  .reduce( ( total, usage ) => mergeUsage( total, usage ), {} );
