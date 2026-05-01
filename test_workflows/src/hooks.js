import { onError, on, onBeforeWorkerStart, onWorkflowStart, onWorkflowEnd, onWorkflowError } from '@outputai/core/hooks';

// custom + sub modules
on( 'custom_event', async payload => console.log( '>>> on(custom_event) >>>', payload ) );
on( 'cost:llm:request', payload => console.log( '>>> on(cost:llm:request) >>>', payload ) );

// Generic on error
onError( ( { source, error, workflowName, activityName } ) => console.log( '>>> onError() >>>', { source, error, workflowName, activityName } ) );

// Worker start
onBeforeWorkerStart( payload => console.log( '>>> onBeforeWorkerStart() >>>', payload ) );

// Workflow lifecycle
onWorkflowStart( payload => console.log( '>>> onWorkflowStart() >>>', payload ) );
onWorkflowEnd( payload => console.log( '>>> onWorkflowEnd() >>>', payload ) );
onWorkflowError( payload => console.log( '>>> onWorkflowError() >>>', payload ) );
