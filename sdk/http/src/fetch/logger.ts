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
 */
export const logRequest = async ( { requestId, request } : { requestId: string, request: Request } ) : Promise<void> => {
  Tracing.addEventStart( {
    id: requestId, kind: 'http', name: 'request', details: {
      method: request.method,
      url: request.url,
      ...( config.logVerbose && { headers: redactHeaders( request.headers ), body: await parseBody( request ) } )
    }
  } );
  Tracing.addEventAttribute( { eventId: requestId, attribute: new Tracing.Attribute.HTTPRequestCount( request.url, requestId ) } );
};

/**
 * Sends the trace error event for an http response with error status
 *
 * @param options
 * @param options.requestId - id of the request
 * @param options.response - The HTTP Response object
 */
export const logError = async ( { requestId, response } : { requestId: string, response: Response } ) : Promise<void> =>
  Tracing.addEventError( {
    id: requestId, details: {
      status: response.status,
      statusText: response.statusText,
      headers: redactHeaders( response.headers ),
      body: await parseBody( response )
    }
  } );

/**
 * Sends the trace end event for an http response
 *
 * @param {object} options
 * @param options.requestId - id of the request
 * @param {Response} options.response - The HTTP Response object
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
