import { temporal as temporalConfig } from '#configs';
import { buildWorkflowId } from '#utils';
import { StepNotFoundError, StepNotCompletedError } from '../../errors.js';
import { EventType } from '../../event_types.js';

const { namespace } = temporalConfig;

/**
 * Resolves a step name to the WORKFLOW_TASK_COMPLETED event ID to reset to.
 * Scans the workflow history to find the activity matching the step, then locates
 * the workflow task completed event immediately after that activity finished.
 *
 * @param {Array} events - Workflow history events
 * @param {string} stepName - The step name to find (e.g., "consolidateCompetitors")
 * @returns {Long} The event ID of the WORKFLOW_TASK_COMPLETED event to reset to
 * @throws {StepNotFoundError}
 * @throws {StepNotCompletedError}
 */
export const resolveResetEventId = ( events, stepName ) => {
  const suffix = `#${stepName}`;

  // Find the last ActivityTaskScheduled event matching the step name
  const scheduledEvent = events.findLast( event =>
    event.eventType === EventType.ACTIVITY_TASK_SCHEDULED &&
    event.activityTaskScheduledEventAttributes?.activityType?.name?.endsWith( suffix )
  );

  if ( !scheduledEvent ) {
    throw new StepNotFoundError( stepName );
  }

  const scheduledId = scheduledEvent.eventId.toString();

  // Find the corresponding ActivityTaskCompleted event
  const completedEvent = events.findLast( event =>
    event.eventType === EventType.ACTIVITY_TASK_COMPLETED &&
    event.activityTaskCompletedEventAttributes?.scheduledEventId?.toString() === scheduledId
  );

  if ( !completedEvent ) {
    throw new StepNotCompletedError( stepName );
  }

  const completedId = Number( completedEvent.eventId.toString() );

  // Find the next WORKFLOW_TASK_COMPLETED event after the activity completed
  const resetEvent = events.find( event =>
    event.eventType === EventType.WORKFLOW_TASK_COMPLETED &&
    Number( event.eventId.toString() ) > completedId
  );

  if ( !resetEvent ) {
    throw new StepNotCompletedError( stepName );
  }

  return resetEvent.eventId;
};

/**
 * Resets a workflow to re-run from after a specific completed step.
 * Terminates the current run and creates a new one that replays up to the
 * specified step, then re-executes all subsequent steps.
 *
 * @param {string} workflowId - The workflow execution id
 * @param {string} stepName - The step name to reset after (e.g., "consolidateCompetitors")
 * @param {string} [reason] - Optional reason for the reset
 * @param {string} [runId] - Optional specific run id to reset; defaults to the latest run
 * @returns {{ workflowId: string, runId: string }} The original workflowId and the runId of the **new** execution created by the reset (not the input pin).
 * @throws {WorkflowNotFoundError}
 * @throws {StepNotFoundError}
 * @throws {StepNotCompletedError}
 */
export const reset = async ( { client, connection }, workflowId, stepName, reason, runId ) => {
  const handle = client.workflow.getHandle( workflowId, runId );

  // Pin the runId before reading history so fetchHistory and the reset RPC
  // target the same execution. Describing first (not after fetchHistory)
  // closes the continueAsNew race where the "latest" run can change between
  // the history read and the reset.
  const resolvedRunId = runId ?? ( await handle.describe() ).runId;
  if ( !resolvedRunId ) {
    throw new Error( `Temporal did not report a runId for workflow "${workflowId}"` );
  }
  const pinnedHandle = runId ? handle : client.workflow.getHandle( workflowId, resolvedRunId );

  const history = await pinnedHandle.fetchHistory();
  const resetEventId = resolveResetEventId( history.events, stepName );

  const response = await connection.workflowService.resetWorkflowExecution( {
    namespace,
    workflowExecution: { workflowId, runId: resolvedRunId },
    reason: reason || `Reset to re-run from after step "${stepName}"`,
    workflowTaskFinishEventId: resetEventId,
    requestId: buildWorkflowId()
  } );

  return { workflowId, runId: response.runId };
};
