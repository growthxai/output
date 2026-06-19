import { KyResponse } from 'ky';
import { Tracing, Event } from '@outputai/core/internal/activity';
import { requestIdSymbol } from './consts.js';

/**
 * Attach cost information to the trace of an HTTP Request using the response
 *
 * @param response - The response of the HTTP Request to attach the information
 * @param value - The price of the HTTP request
 * @returns
 */
export const addRequestCost = ( response: KyResponse | Response, value: number ) : void => {
  const eventId = Reflect.get( response, requestIdSymbol ) as string;
  if ( !eventId ) {
    console.warn( 'addRequestCost(): The "response" argument did not originate from @outputai/http, no costs were added.' );
    return;
  }

  const attribute = new Tracing.Attribute.HTTPRequestCost( response.url, eventId, value );
  Tracing.addEventAttribute( { eventId, attribute } );
  Event.emit( 'cost:http:request', attribute );
};
