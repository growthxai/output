import { Tracing } from '@outputai/core/sdk_activity_integration';
import { logVerbose } from './config.js';

/**
 * Sensitive header patterns for redaction (case-insensitive)
 */
const SENSITIVE_HEADER_PATTERNS = [
  /authorization/i,
  /token/i,
  /api-?key/i,
  /secret/i,
  /password/i,
  /pwd/i,
  /key/i,
  /cookie/i
];

/**
 * Redacts sensitive headers for safe logging
 *
 * @param {Headers} headers
 * @returns {Record<string, string>} Plain object with sensitive headers redacted
 */
export const redactHeaders = headers => {
  const result = {};
  for ( const [ key, value ] of headers.entries() ) {
    const isSensitive = SENSITIVE_HEADER_PATTERNS.some( pattern => pattern.test( key ) );
    result[key] = isSensitive ? '[REDACTED]' : value;
  }
  return result;
};

/**
 * Clones a Request or Response object and parses its body based on its content type:
 * - application/json: object
 * - text/plain: string
 *
 * @param {Response|Request} r
 * @returns {Promise<unknown>} Parsed body (JSON or text)
 */
export const parseBody = async r => {
  const clone = r.clone();
  const contentType = clone.headers.get( 'content-type' ) || '';
  return clone[contentType.includes( 'application/json' ) ? 'json' : 'text']();
};

/**
 * Sends the trace start event for an http request
 *
 * @param {object} options
 * @param {string} options.requestId - id of the request
 * @param {Request} options.request - The HTTP Request object
 * @returns
 */
export const logRequest = async ( { requestId, request } ) =>
  Tracing.addEventStart( {
    id: requestId, kind: 'http', name: 'request', details: {
      method: request.method,
      url: request.url,
      ...( logVerbose && { headers: redactHeaders( request.headers ), body: await parseBody( request ) } )
    }
  } );

/**
 * Sends the trace error event for an http response with error status
 *
 * @param {object} options
 * @param {string} options.requestId - id of the request
 * @param {Response} options.response - The HTTP Response object
 * @returns
 */
export const logError = ( { requestId: id, response: { status, statusText, headers } } ) =>
  Tracing.addEventError( { id, details: { status, statusText, headers: redactHeaders( headers ) } } );

/**
 * Sends the trace end event for an http response
 *
 * @param {object} options
 * @param {string} options.requestId - id of the request
 * @param {Response} options.response - The HTTP Response object
 * @returns
 */
export const logResponse = async ( { requestId, response } ) =>
  Tracing.addEventEnd( {
    id: requestId, details: {
      status: response.status,
      statusText: response.statusText,
      ...( logVerbose && { headers: redactHeaders( response.headers ), body: await parseBody( response ) } )
    }
  } );

/**
 * Creates the trace error event for a network/connection failure
 *
 * @param {object} options
 * @param {string} options.requestId - id of the request
 * @param {Error} options.error - The error thrown
 */
export const logFailure = ( { requestId, error } ) => Tracing.addEventError( { id: requestId, details: error } );
