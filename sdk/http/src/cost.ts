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
  Tracing.addEventAttribute( { eventId, name: 'cost', value: cost } );
};
