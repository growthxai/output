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
