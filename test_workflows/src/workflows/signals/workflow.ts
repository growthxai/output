import { workflow, z } from '@outputai/core';
import { defineSignal, defineUpdate, defineQuery, setHandler, condition } from '@temporalio/workflow';
import { sendSignalsQueriesAndUpdates } from './steps.js';

const messageSignal = defineSignal<[{ value: number }]>( 'message' );
const statusQuery = defineQuery<number>( 'status' );
const editUpdate = defineUpdate<number, [{ items: number[] }]>( 'edit' );

export default workflow( {
  name: 'signals',
  description: 'Temporal signals demo',
  outputSchema: z.object( {
    results: z.array( z.number() ),
    operationsLog: z.object( {
      signalsSent: z.number(),
      queryResult: z.number(),
      updateResult: z.number()
    } )
  } ),
  fn: async ( _input, context ) => {
    const results: number[] = [];
    setHandler( messageSignal, p => {
      results.push( p.value );
    } );
    setHandler( statusQuery, () => results.length );
    setHandler( editUpdate, p => {
      results.splice( 0, results.length, ...p.items );
      return results.length;
    } );

    // Step sends 4 signals + 1 query + 1 update via API so workflow completes by itself
    const operationsLog = await sendSignalsQueriesAndUpdates( {
      workflowId: context.info.workflowId
    } );

    await condition( () => results.length > 3 );

    return { results, operationsLog };
  }
} );
