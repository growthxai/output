import { buildWorkflowId, extractErrorDetail } from '#utils';
import { WorkflowFailedError, WorkflowExecutionTimedOutError } from '../../errors.js';
import { resolveWorkflowName } from '../catalog.js';
import { temporal as temporalConfig } from '#configs';
import { buildWorkflowResult } from '../workflow_result.js';
import { logger } from '#logger';

const { defaultTaskQueue, workflowExecutionTimeout, workflowExecutionMaxWaiting } = temporalConfig;

/**
 * Runs a workflow and return its result.
 *
 * The status field of the result is always 'completed' or 'failed'
 *
 * @param {string} workflowName - The type of the workflow
 * @param {any} input - The input arguments of the workflow
 * @param {Object} [options] - Optional configuration
 * @param {string} [options.workflowId] - Optional custom workflow ID. If not provided, one will be generated.
 * @param {string} [options.taskQueue] - The task queue to send the workflow execution to. Fallbacks to the default task queue.
 * @throws {WorkflowNotFoundError}
 * @throws {WorkflowExecutionTimedOutError}
 * @throws {CatalogNotAvailableError}
 * @returns {WorkflowResult}
 */
export const run = async ( { client }, workflowName, input, options = {} ) => {
  const { workflowId: userWorkflowId, taskQueue = defaultTaskQueue, timeout } = options;

  const resolvedName = await resolveWorkflowName( { client, workflowName, taskQueue } );

  const workflowId = userWorkflowId ?? buildWorkflowId();
  const executionTimeout = timeout ?? workflowExecutionMaxWaiting;
  const handle = await client.workflow.start( resolvedName, { args: [ input ], taskQueue, workflowId, workflowExecutionTimeout } );
  const runId = handle.firstExecutionRunId ?? null;

  try {
    const result = await Promise.race( [
      handle.result(),
      new Promise( ( _, rj ) => setTimeout( () => rj( new WorkflowExecutionTimedOutError() ), executionTimeout ) )
    ] );
    return buildWorkflowResult( { workflowId, status: 'completed', runId, input, result } );
  } catch ( error ) {
    // Workflow failures are returned as data, not thrown
    if ( error instanceof WorkflowFailedError ) {
      logger.warn( 'Workflow execution failed', {
        workflowId,
        errorMessage: error.message,
        hasTrace: Boolean( extractErrorDetail( error, 'trace' ) )
      } );
      return buildWorkflowResult( { workflowId, status: 'failed', runId, input, error } );
    }
    // Other errors (timeout, not found, etc.) are still thrown
    error.workflowId = workflowId;
    error.runId = runId;
    throw error;
  }
};
