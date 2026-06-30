import { isGrpcCancelledError } from '@temporalio/client';
import { workflowNotFoundError } from '../../errors.js';
import { formatStatus, GrpcStatus } from '../types.js';

/**
 * Serialized, transport-friendly view of a Temporal workflow description.
 *
 * @param {object} description - Raw result of `handle.describe()`
 * @param {string} workflowId
 */
const toWorkflowInfo = ( description, workflowId ) => ( {
  workflowId,
  runId: description.runId,
  status: formatStatus( description.status.name ),
  startTime: description.startTime?.toISOString() ?? null,
  closeTime: description.closeTime?.toISOString() ?? null,
  historyLength: description.historyLength,
  taskQueue: description.taskQueue
} );

/**
 * Describe a workflow execution and map it to a serialized info object, translating a gRPC
 * NOT_FOUND into WorkflowNotFoundError. Shared by getHistory and streamHistory so the
 * describe -> workflow mapping and not-found handling live in one place.
 *
 * @param {{ client: import('@temporalio/client').Client }} context
 * @param {string} workflowId
 * @param {object} [options]
 * @param {string} [options.runId] - Specific run to target, defaults to latest
 * @param {(call: () => Promise<object>) => Promise<object>} [options.invoke] - Wraps the
 *   describe call; streamHistory passes `connection.withAbortSignal` to make it cancelable.
 * @returns {Promise<{ workflow: object, description: object }>}
 */
export const describeWorkflow = async ( { client }, workflowId, { runId, invoke = fn => fn() } = {} ) => {
  const handle = client.workflow.getHandle( workflowId, runId );
  const description = await invoke( () => handle.describe() ).catch( error => {
    if ( isGrpcCancelledError( error ) ) {
      // Benign abort from caller cancellation; rethrow bare so callers treat it as a
      // cancellation rather than a real error.
      throw error;
    }
    if ( error?.code === GrpcStatus.NOT_FOUND ) {
      throw workflowNotFoundError( workflowId, runId );
    }
    error.workflowId = workflowId;
    throw error;
  } );

  return { workflow: toWorkflowInfo( description, workflowId ), description };
};
