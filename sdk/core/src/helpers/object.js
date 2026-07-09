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
 * Creates a new object merging object "b" onto object "a", using a resolver function to define the value to keep.
 * - Object "b" fields that also exists on "a" will have their value defined by the "resolver" function
 * - Object "b" fields that don't exist on object "a" will be added;
 * - Object "a" fields that don't exist on object "b" will be preserved;
 *
 * If "b" isn't an object, a new object equal to "a" is returned
 *
 * @param {object} a - The base object
 * @param {object} b - The target object
 * @param {function} resolver - A function that return the value to be kept. First argument is value a, second is value b
 * @returns {object} A new object
 */
export const deepMergeWithResolver = ( a, b, resolver ) => {
  if ( !isPlainObject( a ) ) {
    throw new Error( 'Parameter "a" is not an object.' );
  }
  if ( !isPlainObject( b ) ) {
    return clone( a );
  }
  return Object.entries( b ).reduce( ( obj, [ k, v ] ) =>
    Object.assign( obj, {
      [k]: ( () => {
        if ( isPlainObject( v ) && isPlainObject( a[k] ) ) {
          return deepMergeWithResolver( a[k], v, resolver );
        }
        if ( Object.hasOwn( a, k ) ) {
          return resolver( a[k], v );
        }
        return v;
      } )()
    } )
  , clone( a ) );
};

/**
 * Creates a new object recursively merging the rightmost object over the previous one.
 * Give two objects, (L)eft and (R)right
 * - Object "R" will overwrite fields on object "L";
 * - Object "R" fields that don't exist on object "L" will be added;
 * - Object "L" fields that don't exist on object "R" will be preserved;
 *
 * If "R" isn't an object, a new object equal to "L" is returned
 *
 * @param {object} a - The base object
 * @param {object} b - The target object
 * @returns {object} A new object
 */
export const deepMerge = ( base, ...rest ) => {
  if ( !isPlainObject( base ) ) {
    throw new Error( 'First argument is not an object.' );
  }
  return rest.reduce( ( merged, o ) => deepMergeWithResolver( merged, o, ( _, b ) => b ), base );
};

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
