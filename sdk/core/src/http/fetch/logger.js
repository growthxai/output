import { addEventActionWithContext, EventAction } from '#tracing';
import { BaseAttribute } from '#trace_attribute';
import { config } from '../config.js';
import { redactHeaders } from '#helpers/redact';
import { consumeBody } from '#helpers/fetch';

export class HTTPRequestCount extends BaseAttribute {
  static TYPE = 'http:request:count';
  url;
  requestId;

  constructor( url, requestId ) {
    super( HTTPRequestCount.TYPE );
    this.url = url;
    this.requestId = requestId;
  }
}

/**
 * Sends the trace start event for an http request
 *
 * @param options
 * @param options.requestId - id of the request
 * @param options.request - The HTTP Request object
 */
export const logRequest = async ( { requestId, request } ) => {
  addEventActionWithContext( EventAction.START, {
    id: requestId, kind: 'http', name: 'request', details: {
      method: request.method,
      url: request.url,
      ...( config.logVerbose && { headers: redactHeaders( request.headers ), body: await consumeBody( request.clone() ) } )
    }
  } );
  addEventActionWithContext( EventAction.ADD_ATTR, { id: requestId, details: new HTTPRequestCount( request.url, requestId ) } );
};

export const logError = async ( { requestId, response } ) =>
  addEventActionWithContext( EventAction.ERROR, {
    id: requestId, details: {
      status: response.status,
      statusText: response.statusText,
      ...( config.logVerbose && { headers: redactHeaders( response.headers ), body: await consumeBody( response.clone() ) } )
    }
  } );

export const logResponse = async ( { requestId, response } ) =>
  addEventActionWithContext( EventAction.END, {
    id: requestId, details: {
      status: response.status,
      statusText: response.statusText,
      ...( config.logVerbose && { headers: redactHeaders( response.headers ), body: await consumeBody( response.clone() ) } )
    }
  } );

export const logFailure = ( { requestId, error } ) =>
  addEventActionWithContext( EventAction.ERROR, { id: requestId, details: error } );
