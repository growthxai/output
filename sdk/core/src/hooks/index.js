import { messageBus } from '#bus';
import { BusEventType } from '#consts';
import { createChildLogger } from '#logger';

const log = createChildLogger( 'Hooks' );

export const onError = handler => {
  const invokeHandler = async args => {
    try {
      await handler( args );
    } catch ( error ) {
      log.error( 'onError hook error', { error } );
    }
  };

  messageBus.on( BusEventType.ACTIVITY_ERROR, async ( { name, workflowName, error } ) =>
    invokeHandler( { source: 'activity', activityName: name, workflowName, error } ) );
  messageBus.on( BusEventType.WORKFLOW_ERROR, async ( { name, error } ) =>
    invokeHandler( { source: 'workflow', workflowName: name, error } ) );
  messageBus.on( BusEventType.RUNTIME_ERROR, async ( { error } ) =>
    invokeHandler( { source: 'runtime', error } ) );
};

export const on = ( eventName, handler ) => {
  messageBus.on( `external:${eventName}`, async payload => {
    try {
      await handler( payload );
    } catch ( error ) {
      log.error( `on(${eventName}) hook error`, { error } );
    }
  } );
};
