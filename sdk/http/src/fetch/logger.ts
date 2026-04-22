import { Tracing } from '@outputai/core/sdk_activity_integration';
import { config } from '../config.js';
import type { Request, Response } from 'undici';
import { parseBody, redactHeaders, serializeError } from './utils.js';

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
  Tracing.addEventError( { id: requestId, details: serializeError( error ) } );
