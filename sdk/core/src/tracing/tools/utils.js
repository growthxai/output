import { inspect } from 'node:util';

/**
 * @typedef {object} SerializedError
 * @property {string} name - The error constructor name
 * @property {string} message - The error message
 * @property {string} stack - The error stack trace
 */

/**
 * Recursively Serialize an error object. Navigate using "cause" property.
 *
 * Goes up 10 levels deep.
 *
 * @param {Error} error
 * @returns {SerializedError}
 */
export const serializeError = ( () => {

  const serializeValue = v => {
    try {
      return JSON.parse( JSON.stringify( v ) );
    } catch {
      return inspect( v, { depth: 5, breakLength: Infinity, colors: false } );
    }
  };

  return ( error, depth = 0 ) => {
    if ( depth > 10 ) {
      return { name: 'Error', message: 'Cause chain too deep' };
    }
    if ( error instanceof Error ) {
      return {
        name: error.constructor.name,
        message: error.message,
        stack: error.stack,
        ...( error.cause !== undefined ? { cause: serializeError( error.cause, depth + 1 ) } : {} )
      };
    }
    return serializeValue( error );
  };
} )();
