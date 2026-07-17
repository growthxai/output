import { Tracing } from '@outputai/core/sdk/runtime';
import { config } from '../config.js';
import { parseBody, redactHeaders, serializeError } from './utils.js';

/**
 * Sends the trace start event for an http request
 *
 * @param options
 * @param options.requestId - id of the request
 * @param options.request - The HTTP Request object
 */
export const logRequest = async ( { requestId, request } ) => {
  Tracing.addEventStart( {
    id: requestId, kind: 'http', name: 'request', details: {
      method: request.method,
      url: request.url,
      ...( config.logVerbose && { headers: redactHeaders( request.headers ), body: await parseBody( request ) } )
    }
  } );
  Tracing.addEventAttribute( { eventId: requestId, attribute: new Tracing.Attribute.HTTPRequestCount( request.url, requestId ) } );
};

export const logError = async ( { requestId, response } ) =>
  Tracing.addEventError( {
    id: requestId, details: {
      status: response.status,
      statusText: response.statusText,
      headers: redactHeaders( response.headers ),
      body: await parseBody( response )
    }
  } );

export const logResponse = async ( { requestId, response } ) =>
  Tracing.addEventEnd( {
    id: requestId, details: {
      status: response.status,
      statusText: response.statusText,
      ...( config.logVerbose && { headers: redactHeaders( response.headers ), body: await parseBody( response ) } )
    }
  } );

export const logFailure = ( { requestId, error } ) =>
  Tracing.addEventError( { id: requestId, details: serializeError( error ) } );
