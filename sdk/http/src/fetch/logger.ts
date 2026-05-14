import { Tracing, emitEvent } from '@outputai/core/sdk_activity_integration';
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
 * and emits a `http:request` event with `outcome: 'http_error'`.
 *
 * @param options
 * @param options.requestId - id of the request
 * @param options.response - The HTTP Response object
 * @param options.method - HTTP method of the request
 * @param options.url - URL of the request
 * @param options.durationMs - elapsed time from request issuance to response, in milliseconds
 */
export const logError = async ( {
  requestId, response, method, url, durationMs
} : {
  requestId: string, response: Response, method: string, url: string, durationMs: number
} ) : Promise<void> => {
  await Tracing.addEventError( {
    id: requestId, details: {
      status: response.status,
      statusText: response.statusText,
      headers: redactHeaders( response.headers ),
      body: await parseBody( response )
    }
  } );
  emitEvent( 'http:request', {
    requestId,
    method,
    url,
    status: response.status,
    durationMs,
    outcome: 'http_error'
  } );
};

/**
 * Sends the trace end event for an http response
 * and emits a `http:request` event with `outcome: 'success'`.
 *
 * @param {object} options
 * @param options.requestId - id of the request
 * @param {Response} options.response - The HTTP Response object
 * @param options.method - HTTP method of the request
 * @param options.url - URL of the request
 * @param options.durationMs - elapsed time from request issuance to response, in milliseconds
 */
export const logResponse = async ( {
  requestId, response, method, url, durationMs
} : {
  requestId: string, response: Response, method: string, url: string, durationMs: number
} ) : Promise<void> => {
  await Tracing.addEventEnd( {
    id: requestId, details: {
      status: response.status,
      statusText: response.statusText,
      ...( config.logVerbose && { headers: redactHeaders( response.headers ), body: await parseBody( response ) } )
    }
  } );
  emitEvent( 'http:request', {
    requestId,
    method,
    url,
    status: response.status,
    durationMs,
    outcome: 'success'
  } );
};

/**
 * Creates the trace error event for a network/connection failure
 * and emits a `http:request` event with `outcome: 'network_error'`.
 *
 * @param options
 * @param options.requestId - id of the request
 * @param options.error - The error thrown
 * @param options.method - HTTP method of the request
 * @param options.url - URL of the request
 * @param options.durationMs - elapsed time from request issuance to failure, in milliseconds
 */
export const logFailure = ( {
  requestId, error, method, url, durationMs
} : {
  requestId: string, error: Error, method: string, url: string, durationMs: number
} ) : void => {
  Tracing.addEventError( { id: requestId, details: serializeError( error ) } );
  emitEvent( 'http:request', {
    requestId,
    method,
    url,
    status: undefined,
    durationMs,
    outcome: 'network_error'
  } );
};
