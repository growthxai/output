import { KyResponse } from 'ky';
import { config } from './config.js';
import { Tracing } from '@outputai/core/sdk_activity_integration';

export type RequestCost = {
  total: number,
  components?: [
    {
      name: string,
      value: number
    }
  ]
};

export const addRequestCost = async ( response: KyResponse | Response, cost: RequestCost ) : Promise<void> => {
  const eventId = Reflect.get( response, config.requestIdSymbol ) as string;
  if ( !eventId ) {
    console.warn( 'addRequestCost(): The "response" argument did not originate from @outputai/http, no costs were added.' );
    return;
  }
  Tracing.addEventAttribute( { eventId, name: 'cost', value: cost } );
};
