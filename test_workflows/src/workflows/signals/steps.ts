import { step, z } from '@outputai/core';

const url = process.env.TEST_API_URL ?? 'http://api:3001';

const inputSchema = z.object( {
  workflowId: z.string()
} );

const outputSchema = z.object( {
  signalsSent: z.number(),
  queryResult: z.number(),
  updateResult: z.number()
} );

/**
 * Sends signals, then a query, then an update to the given workflow via the Output API,
 * so the workflow receives enough signals to satisfy condition(results.length > 3) and
 * all operations are exercised and logged.
 */
export const sendSignalsQueriesAndUpdates = step( {
  name: 'sendSignalsQueriesAndUpdates',
  description: 'Send signal, query, and update to the workflow via API for self-completion',
  inputSchema,
  outputSchema,
  fn: async ( { workflowId } ) => {
    const base = `${url}/workflow/${workflowId}`;

    const state = { signalsSent: 0 };
    for ( const i of [ 1, 2, 3 ] ) {
      const response = await fetch( `${base}/signal/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify( { payload: { value: i } } )
      } );
      if ( !response.ok ) {
        throw new Error( `Signal request failed with status ${response.status}` );
      }
      state.signalsSent++;
    }

    const queryRes = await fetch( `${base}/query/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify( { payload: {} } )
    } );
    if ( !queryRes.ok ) {
      throw new Error( `Query request failed with status ${queryRes.status}` );
    }

    const queryResult = ( await queryRes.json() ) as number;

    const updateRes = await fetch( `${base}/update/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify( { payload: { items: [ 1, 2, 3, 4 ] } } )
    } );
    if ( !updateRes.ok ) {
      throw new Error( `Update request failed with status ${updateRes.status}` );
    }

    const updateResult = ( await updateRes.json() ) as number;

    return {
      ...state,
      queryResult,
      updateResult
    };
  }
} );
