import { messageBus } from '#bus';
import { createChildLogger } from '#logger';
import { ACTIVITY_GET_TRACE_DESTINATIONS, BusEventType, LifecycleEvent, WORKFLOW_CATALOG } from '#consts';

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

const serializedActivityFields = activityInfo => ( {
  activityId: activityInfo.activityId,
  activityType: activityInfo.activityType,
  workflowId: activityInfo.workflowExecution.workflowId,
  workflowType: activityInfo.workflowType,
  runId: activityInfo.workflowExecution.runId
} );

const shouldLogActivity = activityInfo => activityInfo.activityType !== ACTIVITY_GET_TRACE_DESTINATIONS;

messageBus.on( BusEventType.ACTIVITY_START, ( { activityInfo, outputActivityKind } ) =>
  shouldLogActivity( activityInfo ) && activityLog.info( `Started ${activityInfo.activityType} ${outputActivityKind}`, {
    event: LifecycleEvent.START,
    ...serializedActivityFields( activityInfo )
  } )
);

messageBus.on( BusEventType.ACTIVITY_END, ( { activityInfo, outputActivityKind } ) =>
  shouldLogActivity( activityInfo ) && activityLog.info( `Ended ${activityInfo.activityType} ${outputActivityKind}`, {
    event: LifecycleEvent.END,
    ...serializedActivityFields( activityInfo )
  } )
);

messageBus.on( BusEventType.ACTIVITY_ERROR, ( { activityInfo, outputActivityKind, error } ) =>
  shouldLogActivity( activityInfo ) && activityLog.error( `Error ${activityInfo.activityType} ${outputActivityKind}: ${error.constructor.name}`, {
    event: LifecycleEvent.ERROR,
    ...serializedActivityFields( activityInfo ),
    error: error.message
  } )
);

/*
╔═════════════════╗
║ Workflow events ║
╚═════════════════╝
*/

const serializeWorkflowFields = workflowDetails => ( {
  workflowId: workflowDetails.workflowId,
  workflowType: workflowDetails.workflowType,
  runId: workflowDetails.runId
} );

const shouldLogWorkflow = workflowDetails => workflowDetails.workflowType !== WORKFLOW_CATALOG;

messageBus.on( BusEventType.WORKFLOW_START, ( { workflowDetails } ) =>
  shouldLogWorkflow( workflowDetails ) && workflowLog.info( `Started ${workflowDetails.workflowType} workflow`, {
    event: LifecycleEvent.START,
    ...serializeWorkflowFields( workflowDetails )
  } )
);

messageBus.on( BusEventType.WORKFLOW_END, ( { workflowDetails } ) =>
  shouldLogWorkflow( workflowDetails ) && workflowLog.info( `Ended ${workflowDetails.workflowType} workflow`, {
    event: LifecycleEvent.END,
    ...serializeWorkflowFields( workflowDetails )
  } )
);

messageBus.on( BusEventType.WORKFLOW_ERROR, ( { workflowDetails, error } ) =>
  shouldLogWorkflow( workflowDetails ) && workflowLog.error( `Error ${workflowDetails.workflowType} workflow: ${error.constructor.name}`, {
    event: LifecycleEvent.ERROR,
    ...serializeWorkflowFields( workflowDetails ),
    error: error.message
  } )
);
