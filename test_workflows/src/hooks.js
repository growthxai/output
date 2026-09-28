// import {
//   onError,
//   on,
//   emit,
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
// on( 'llm:generation:metering', event => console.log( colorize( 'on(llm:generation:metering)' ), {
//   cost: event.payload.cost,
//   usage: event.payload.usage
// } ) );
// on( 'cost:llm:request', payload => console.log( colorize( 'on(cost:llm:request)' ), payload ) );
// on( 'cost:http:request', payload => console.log( colorize( 'on(cost:http:request)' ), payload ) );
// on( 'test', payload => console.log( colorize( 'on(test)' ), payload ) );

// // Generic on error
// onError( payload => console.log( colorize( 'onError()' ), payload ) );

// // Workflow lifecycle
// onWorkflowStart( payload => console.log( colorize( 'onWorkflowStart()' ), payload ) );
// onWorkflowEnd( payload => console.log( colorize( 'onWorkflowEnd()' ), payload ) );
// onWorkflowError( payload => console.log( colorize( 'onWorkflowError()' ), payload ) );

// // Activity lifecycle
// onActivityStart( payload => console.log( colorize( 'onActivityStart()' ), payload ) );
// onActivityEnd( payload => console.log( colorize( 'onActivityStart()' ), payload ) );
// onActivityError( payload => console.log( colorize( 'onActivityError()' ), payload ) );

// SPIKE: checks whether searchAttributes survives the step-event (stepEventBus) path
// for `cost:http:request` subscribers. Remove or replace with a spec before merge.
import { Logger } from '@outputai/core';
import { on } from '@outputai/core/hooks';

on( 'cost:http:request', event => {
  if ( !event.workflowDetails?.workflowId ) return;

  Logger.info( 'http.usage', {
    clientId: event.workflowDetails.searchAttributes?.WorkspaceId?.[ 0 ],
    url: event.payload?.url,
    requestId: event.payload?.requestId,
    costUsd: event.payload?.total
  } );
} );
