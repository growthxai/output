import { stepEventBus } from '#bus';
import { requestIdSymbol } from './request_tag.js';
import { Logger } from '#runtime_logger';
import { addEventActionWithContext, EventAction } from '#tracing';
import { BaseAttribute } from '#trace_attribute';

export class HTTPRequestCost extends BaseAttribute {
  static TYPE = 'http:request:cost';
  url;
  requestId;
  total = 0;

  constructor( url, requestId, total ) {
    super( HTTPRequestCost.TYPE );
    this.url = url;
    this.requestId = requestId;
    this.total = total;
  }
}

/**
 * Attach cost information to the trace of an HTTP Request using the response
 *
 * @param {Response} response - The response of the HTTP Request to attach the information
 * @param {number} value - The price of the HTTP request
 * @returns {void}
 */
export const addRequestCost = ( response, value ) => {
  const eventId = Reflect.get( response, requestIdSymbol );
  if ( !eventId ) {
    Logger.warn(
      'addRequestCost(): The "response" argument did not originate from @outputai/core/http, no costs were added.',
      { namespace: 'HTTP' }
    );
    return;
  }

  const attribute = new HTTPRequestCost( response.url, eventId, value );
  addEventActionWithContext( EventAction.ADD_ATTR, { id: eventId, details: attribute } );
  stepEventBus.emit( 'sdk:cost:http:request', attribute );
};
