/**
 * Detect a JS plain object.
 *
 * @param {unknown} v
 * @returns {boolean}
 */
export const isPlainObject = v =>
  typeof v === 'object' &&
    !Array.isArray( v ) &&
    v !== null &&
    [ Object.prototype, null ].includes( Object.getPrototypeOf( v ) );

/**
 * Node safe clone implementation that doesn't use global structuredClone()
 * @param {object} v
 * @returns {object}
 */
export const clone = v => {
  try {
    return JSON.parse( JSON.stringify( v ) );
  } catch {
    return v;
  }
};

/**
 * Creates a new object recursively merging the rightmost object over the previous one using a resolver function.
 * Give two objects, (L)eft and (R)right
 * - Object "R" will overwrite fields on object "L" based on the result of the resolver function;
 * - Object "R" fields that don't exist on object "L" will be added;
 * - Object "L" fields that don't exist on object "R" will be preserved;
 *
 * If "R" isn't an object, a new object equal to "L" is returned.
 *
 * The resolver function will define the final value of the merge, it receives two args value "L" and "R".
 *
 *
 * @param {object} base - The base object
 * @param {...(object|function)} args - Target objects followed by the resolver function
 * @returns {object} A new object
 */
export const deepMergeWithResolver = ( base, ...args ) => {
  const objects = args.slice( 0, -1 );
  const resolver = args.at( -1 );

  if ( !isPlainObject( base ) ) {
    throw new Error( 'First argument is not an object.' );
  }

  return objects.reduce( ( merged, object ) => {
    if ( !isPlainObject( object ) ) {
      return merged;
    }

    for ( const [ k, v ] of Object.entries( object ) ) {
      if ( isPlainObject( v ) && isPlainObject( merged[k] ) ) {
        merged[k] = deepMergeWithResolver( merged[k], v, resolver );
      } else if ( Object.hasOwn( merged, k ) ) {
        merged[k] = resolver( merged[k], v );
      } else {
        merged[k] = v;
      }
    }
    return merged;
  }, clone( base ) );
};

/**
 * Creates a new object recursively merging the rightmost object over the previous one.
 * Give two objects, (L)eft and (R)right
 * - Object "R" will overwrite fields on object "L";
 * - Object "R" fields that don't exist on object "L" will be added;
 * - Object "L" fields that don't exist on object "R" will be preserved;
 *
 * If "R" isn't an object, a new object equal to "L" is returned.
 *
 * @param {object} base - The base object
 * @param {...object} rest - The target objects
 * @returns {object} A new object
 */
export const deepMerge = ( base, ...rest ) =>
  deepMergeWithResolver( base, ...rest, ( _, b ) => b );

/**
 * Adds an non-writable, non-configurable and non-enumerable property to an object
 * @param {object} obj
 * @param {string|Symbol} key
 * @param {any} value
 * @returns
 */
export const assignImmutableProperty = ( obj, key, value ) => Object.defineProperty( obj, key, {
  value,
  writable: false,
  configurable: false,
  enumerable: false
} );

/**
 * Receives an array and returns a copy of it with the elements shuffled
 *
 * @param {array} arr
 * @returns {array}
 */
export const shuffleArray = arr => arr
  .map( v => ( { v, sort: Math.random() } ) )
  .sort( ( a, b ) => a.sort - b.sort )
  .map( ( { v } ) => v );
