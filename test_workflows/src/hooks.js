// import {
//   onError,
//   on,
//   onBeforeWorkerStart,
//   onWorkflowStart,
//   onWorkflowEnd,
//   onWorkflowError,
//   onActivityStart,
//   onActivityEnd,
//   onActivityError
// } from '@outputai/core/hooks';

// const colorize = message => `\x1b[45;30m[HOOK]\x1b[0;35;1m ${message}\x1b[0m`;

// // custom + sub modules
// on( 'http:request', async payload => console.log( colorize( 'on(http:request)' ), payload ) );
// on( 'cost:llm:request', payload => console.log( colorize( 'on(cost:llm:request)' ), payload ) );
// on( 'cost:http:request', payload => console.log( colorize( 'on(cost:llm:request)' ), payload ) );

// // Generic on error
// onError( payload => console.log( colorize( 'onError()' ), payload ) );

// // Worker start
// onBeforeWorkerStart( () => console.log( colorize( 'onBeforeWorkerStart()' ) ) );

// // Workflow lifecycle
// onWorkflowStart( payload => console.log( colorize( 'onWorkflowStart()' ), payload ) );
// onWorkflowEnd( payload => console.log( colorize( 'onWorkflowEnd()' ), payload ) );
// onWorkflowError( payload => console.log( colorize( 'onWorkflowError()' ), payload ) );

// onActivityStart( ( { activityInfo, outputActivityKind } ) => console.log( colorize( 'onActivityStart()' ), { activityInfo, outputActivityKind } ) );
// onActivityEnd( ( { aggregations } ) => console.log( colorize( 'onActivityStart()' ), { aggregations } ) );
