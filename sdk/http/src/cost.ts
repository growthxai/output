import { KyResponse } from 'ky';
import { Tracing } from '@outputai/core/sdk_activity_integration';
import { requestIdSymbol } from './consts.js';

export type RequestCost = {
  total: number,
  components?: Array<{
    name: string,
    value: number
  }>
};

/**
 * Attach cost information to the trace of an HTTP Request using the response
 *
 * @param response - The response of the HTTP Request to attach the information
 * @param cost - The cost information
 * @returns
 */
export const addRequestCost = ( response: KyResponse | Response, cost: RequestCost ) : void => {
  const eventId = Reflect.get( response, requestIdSymbol ) as string;
  if ( !eventId ) {
    console.warn( 'addRequestCost(): The "response" argument did not originate from @outputai/http, no costs were added.' );
    return;
  }
  Tracing.addEventAttribute( { eventId, name: Tracing.Attribute.COST, value: cost } );
};
