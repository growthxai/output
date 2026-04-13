import { Tracing } from '@outputai/core/sdk_activity_integration';
import { config } from '../config.js';
import type { Request, Response, Headers } from 'undici';

/**
 * Sensitive header patterns for redaction (case-insensitive)
 */
const SENSITIVE_HEADER_PATTERNS : RegExp[] = [
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
 * @param headers
 * @returns Plain object with sensitive headers redacted
 */
export const redactHeaders = ( headers: Headers ) : Record<string, unknown> => {
  const result : Record<string, unknown> = {};
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
 * @param r
 * @returns Parsed body (JSON or text)
 */
export const parseBody = async ( r : Request | Response ) : Promise<string | object> => {
  const clone = r.clone();
  const contentType = clone.headers.get( 'content-type' ) || '';
  return clone[contentType.includes( 'application/json' ) ? 'json' : 'text']() as Promise<string | object>;
};

/**
 * Sends the trace start event for an http request
 *
 * @param options
 * @param options.requestId - id of the request
 * @param options.request - The HTTP Request object
 * @returns
 */
export const logRequest = async ( { requestId, request } : { requestId: string, request: Request } ) : Promise<void> =>
  Tracing.addEventStart( {
    id: requestId, kind: 'http', name: 'request', details: {
      method: request.method,
      url: request.url,
      ...( config.logVerbose && { headers: redactHeaders( request.headers ), body: await parseBody( request ) } )
    }
  } );

/**
 * Sends the trace error event for an http response with error status
 *
 * @param options
 * @param options.requestId - id of the request
 * @param options.response - The HTTP Response object
 * @returns
 */
export const logError = ( { requestId: id, response: { status, statusText, headers } } : { requestId: string, response: Response } ) : void =>
  Tracing.addEventError( { id, details: { status, statusText, headers: redactHeaders( headers ) } } );

/**
 * Sends the trace end event for an http response
 *
 * @param {object} options
 * @param options.requestId - id of the request
 * @param {Response} options.response - The HTTP Response object
 * @returns
 */
export const logResponse = async ( { requestId, response } : { requestId: string, response: Response } ) : Promise<void> =>
  Tracing.addEventEnd( {
    id: requestId, details: {
      status: response.status,
      statusText: response.statusText,
      ...( config.logVerbose && { headers: redactHeaders( response.headers ), body: await parseBody( response ) } )
    }
  } );

/**
 * Creates the trace error event for a network/connection failure
 *
 * @param options
 * @param options.requestId - id of the request
 * @param options.error - The error thrown
 */
export const logFailure = ( { requestId, error } : { requestId: string, error: Error } ) : void =>
  Tracing.addEventError( { id: requestId, details: error } );
