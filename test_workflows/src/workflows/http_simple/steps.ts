import { step, z } from '@outputai/core';
import { addRequestCost, httpClient } from '@outputai/http';

const client = httpClient( {
  prefixUrl: 'https://httpbin.io',
  timeout: 3000
} );

export const callHttpWithCost = step( {
  name: 'callHttpWithCost',
  description: 'Make one HTTP request and attach a request cost',
  outputSchema: z.string(),
  fn: async () => {
    const response = await client.get( 'anything/http-cost' );
    addRequestCost( response, 1 );

    return String( response.status );
  }
} );
