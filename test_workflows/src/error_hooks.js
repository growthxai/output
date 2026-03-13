import { onError, on } from '@outputai/core/hooks';

onError( async ( { source, error, workflowName, activityName } ) => {
  console.log( '>>> onError() >>>', { source, error, workflowName, activityName } );
} );

on( 'custom_event', async payload => {
  console.log( '>>> on(\'custom_event\') >>>', payload );
} );

on( 'llm:call_cost', async payload => {
  console.log( '>>> on(\'llm:call_cost\') >>>', payload );
} );
