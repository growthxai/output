import { messageBus } from '#bus';
import { createChildLogger } from '#logger';
import { BusEventType, ComponentType, LifecycleEvent, WORKFLOW_CATALOG } from '#consts';

const activityLog = createChildLogger( 'Activity' );
const workflowLog = createChildLogger( 'Workflow' );

/**
 * Intercepts internal bus events for activity and workflow lifecycle and log them
 */

/*
╔═════════════════╗
║ Activity events ║
╚═════════════════╝
*/

/**
 * Returns true if activity event should be logged
 */
const shouldLogActivityEvent = ( { kind } ) => kind !== ComponentType.INTERNAL_STEP;

messageBus.on( BusEventType.ACTIVITY_START, ( { id, name, kind, workflowId, workflowName } ) =>
  shouldLogActivityEvent( { kind } ) && activityLog.info( `Started ${name} ${kind}`, {
    event: LifecycleEvent.START,
    activityId: id,
    activityName: name,
    activityKind: kind,
    workflowId,
    workflowName
  } )
);

messageBus.on( BusEventType.ACTIVITY_END, ( { id, name, kind, workflowId, workflowName, duration } ) =>
  shouldLogActivityEvent( { kind } ) && activityLog.info( `Ended ${name} ${kind}`, {
    event: LifecycleEvent.END,
    activityId: id,
    activityName: name,
    activityKind: kind,
    workflowId,
    workflowName,
    durationMs: duration
  } )
);

messageBus.on( BusEventType.ACTIVITY_ERROR, ( { id, name, kind, workflowId, workflowName, duration, error } ) =>
  shouldLogActivityEvent( { kind } ) && activityLog.error( `Error ${name} ${kind}: ${error.constructor.name}`, {
    event: LifecycleEvent.ERROR,
    activityId: id,
    activityName: name,
    activityKind: kind,
    workflowId,
    workflowName,
    durationMs: duration,
    error: error.message
  } )
);

/*
╔═════════════════╗
║ Workflow events ║
╚═════════════════╝
*/

/**
 * Returns true if activity event should be logged
 */
const shouldLogWorkflowEvent = ( { name } ) => name !== WORKFLOW_CATALOG;

messageBus.on( BusEventType.WORKFLOW_START, ( { id, name } ) =>
  shouldLogWorkflowEvent( { name } ) && workflowLog.info( `Started ${name} workflow`, {
    event: LifecycleEvent.START,
    workflowId: id,
    workflowName: name
  } )
);

messageBus.on( BusEventType.WORKFLOW_END, ( { id, name, duration } ) =>
  shouldLogWorkflowEvent( { name } ) && workflowLog.info( `Ended ${name} workflow`, {
    event: LifecycleEvent.END,
    workflowId: id,
    workflowName: name,
    durationMs: duration
  } )
);

messageBus.on( BusEventType.WORKFLOW_ERROR, ( { id, name, duration, error } ) =>
  shouldLogWorkflowEvent( { name } ) && workflowLog.error( `Error ${name} workflow: ${error.constructor.name}`, {
    event: LifecycleEvent.ERROR,
    workflowId: id,
    workflowName: name,
    durationMs: duration,
    error: error.message
  } )
);
