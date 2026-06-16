import { defaultPayloadConverter } from '@temporalio/client';
import { temporal as temporalConfig } from '#configs';
import { WorkflowNotFoundError, WorkflowFailedError, WorkflowNotCompletedError } from '../../errors.js';
import { WorkflowStatus, isWorkflowClosed, GrpcStatus, formatStatus } from '../types.js';
import { buildWorkflowResult } from '../workflow_result.js';
import { logger } from '#logger';
const { namespace } = temporalConfig;

/**
 * Extracts the workflow input from a Temporal history object.
 *
 * @param {object} history - Temporal History object (e.g. GetWorkflowExecutionHistoryResponse.history); the first event must be WorkflowExecutionStarted, which contains the input payloads
 * @returns {any} The decoded first input argument, or null if unavailable
 */
export const extractWorkflowInput = history => {
  const payloads = history?.events?.[0]?.workflowExecutionStartedEventAttributes?.input?.payloads;
  if ( !payloads?.length ) {
    return null;
  }
  return defaultPayloadConverter.fromPayload( payloads[0] );
};

/**
 * Returns the result of a workflow execution.
 *
 * @param {string} workflowId - The workflow execution id
 * @param {string} [runId] - Optional specific run id; defaults to the latest run
 * @returns {WorkflowResult}
 * @throws {WorkflowNotFoundError}
 * @throws {WorkflowNotCompletedError} - Only thrown if workflow is still running
 */
export const getResult = async ( { client, connection }, workflowId, runId ) => {
  const handle = client.workflow.getHandle( workflowId, runId );
  const description = await handle.describe();

  // Only throw if workflow is still running (not in a terminal state)
  if ( !isWorkflowClosed( description.status.code ) ) {
    throw new WorkflowNotCompletedError();
  }

  const resolvedRunId = description.runId;
  if ( !resolvedRunId ) {
    // Temporal should always report a runId for a terminal execution; if not, fail loudly
    // rather than silently reuse the unpinned handle (which risks racing continueAsNew).
    throw new Error( `Temporal did not report a runId for workflow "${workflowId}"` );
  }
  // Pin a handle to the resolved run so subsequent RPCs can't race against continueAsNew
  const pinnedHandle = runId ? handle : client.workflow.getHandle( workflowId, resolvedRunId );
  // The input lives in the first event (WorkflowExecutionStarted), so a
  // single-event page suffices instead of paging through the full history
  const firstPage = await connection.workflowService.getWorkflowExecutionHistory( {
    namespace,
    execution: { workflowId, runId: resolvedRunId },
    maximumPageSize: 1
  } ).catch( error => {
    if ( error?.code === GrpcStatus.NOT_FOUND ) {
      throw new WorkflowNotFoundError( `Run "${resolvedRunId}" not found for workflow "${workflowId}"` );
    }
    throw error;
  } );

  if ( !firstPage.history ) {
    logger.warn( 'Temporal getWorkflowExecutionHistory returned no history field', { workflowId, runId: resolvedRunId } );
  }

  const status = formatStatus( description.status.name );
  const input = extractWorkflowInput( firstPage.history );

  // For completed workflows, return the full result
  if ( description.status.code === WorkflowStatus.COMPLETED ) {
    const result = await pinnedHandle.result();
    return buildWorkflowResult( { workflowId, status, runId: resolvedRunId, input, result } );
  }

  // CONTINUED_AS_NEW is not an error - it means the workflow continued in a new execution
  if ( description.status.code === WorkflowStatus.CONTINUED_AS_NEW ) {
    return buildWorkflowResult( { workflowId, status, runId: resolvedRunId, input } );
  }

  // For other terminal statuses (failed, canceled, terminated, timed_out), extract trace from error details
  // The workflow interceptor puts trace metadata in ApplicationFailure.details when workflows fail
  const workflowError = await pinnedHandle.result()
    .then( () => null )
    .catch( e => {
      if ( e instanceof WorkflowFailedError ) {
        return e;
      }
      // Unexpected error (connection, auth, etc.) - log at warn; error_handler logs at error on re-throw
      logger.warn( 'Unexpected error fetching workflow result', {
        workflowId,
        status,
        errorType: e.constructor.name,
        message: e.message
      } );
      throw e;
    } );

  return buildWorkflowResult( { workflowId, status, runId: resolvedRunId, input, error: workflowError } );
};
