/**
 * @typedef {object} SerializedError
 * @property {string} name - The error constructor name
 * @property {string} message - The error message
 * @property {string} stack - The error stack trace
 */

/**
 * Serialize an error object.
 *
 * If it has ".cause", recursive serialize its cause until finally found an error without it.
 *
 * @param {Error} error
 * @returns {SerializedError}
 */
export const serializeError = error =>
  error.cause ? serializeError( error.cause ) : {
    name: error.constructor.name,
    message: error.message,
    stack: error.stack
  };

/**
 * Tries to stringify an object to an indented JSON string.
 * If its byte size is bigger than threshold returns a plain JSON string without formatting.
 *
 * @param {object|array} content
 * @param {*} [threshold] - The max allowed size to try to stringify with formatting (in bytes). Default is 50mb
 * @returns {string} String representation of the object
 */
export const safeFormatJSON = ( content, threshold = 50 * 1024 * 1024 /* 50mb */ ) => {
  const plainString = JSON.stringify( content );
  const plainStringSize = Buffer.byteLength( plainString, 'utf8' );

  if ( plainStringSize > threshold ) {
    return plainString;
  }
  try {
    return JSON.stringify( content, undefined, 2 );
  } catch ( error ) {
    // Only handles this specific error because other common parsing errors like:
    // "TypeError: cyclic object value" and "RangeError: Maximum call stack size exceeded"
    // would have been thrown on the first parsing.
    if ( error instanceof RangeError && error.message === 'Invalid string length' ) {
      return plainString;
    }
    throw error;
  }
};
