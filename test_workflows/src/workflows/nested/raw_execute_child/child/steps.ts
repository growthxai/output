import { step, z } from '@outputai/core';
import { addRequestCost, createKyClient } from '@outputai/http';

const client = createKyClient( {
  prefix: 'https://httpbin.io',
  timeout: 3000
} );

export const callHttpWithCost = step( {
  name: 'callHttpWithCost',
  description: 'Make one HTTP request and attach a request cost, so the child trace has a cost event',
  inputSchema: z.object( { label: z.string() } ),
  outputSchema: z.object( { label: z.string() } ),
  fn: async ( { label } ) => {
    const response = await client.get( `anything/${label}` );
    addRequestCost( response, 1 );

    return { label };
  }
} );
