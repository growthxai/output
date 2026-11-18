import { isPlainObject } from './object.js';

/**
 * Checks whether a value inherits from a constructor matching any supplied class name.
 * @param {*} obj - Value whose prototype chain to inspect
 * @param {string[]} classNames - Constructor names to match
 * @returns {boolean} Whether a matching constructor exists
 */
export const inheritsFromAnyNamedType = ( obj, classNames ) => {
  if ( classNames.length === 0 ) {
    return false;
  }
  if ( obj === null || ( typeof obj !== 'object' && typeof obj !== 'function' ) ) {
    return false;
  }

  const prototype = Object.getPrototypeOf( obj );
  if ( !prototype ) {
    return false;
  }

  const constructor = Object.getOwnPropertyDescriptor( prototype, 'constructor' )?.value;
  if ( constructor?.name && classNames.includes( constructor.name ) ) {
    return true;
  }
  return inheritsFromAnyNamedType( prototype, classNames );
};

/**
 * Builds an error attributing all enumerable properties from a given object.
 * Property `cause` is rehydrated recursively when it is a plain object.
 *
 * If object is already an error, it is returned as it is.
 *
 * If is a primitive, it will only set message to its string value.
 *
 * @param {unknown} target
 * @returns {Error}
 */
export const rehydrateError = target => {
  if ( target instanceof Error ) {
    return target;
  }
  const error = new Error();
  error.stack = undefined;

  if ( target === null || target === undefined ) {
    return error;
  }
  if ( typeof target === 'object' ) {
    for ( const [ p, v ] of Object.entries( target ) ) {
      error[p] = ( p === 'cause' && isPlainObject( v ) ) ? rehydrateError( v ) : v;
    }
    return error;
  }
  error.message = String( target );
  return error;
};
