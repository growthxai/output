import { buildWorkflowId } from '#utils';
import { WorkflowFailedError, WorkflowExecutionTimedOutError } from '../../errors.js';
import { resolveWorkflowName } from '../catalog.js';
import { temporal as temporalConfig } from '#configs';
import { buildWorkflowResult } from '../workflow_result.js';
import { logger } from '#logger';
import { formatStatus } from '../types.js';

const { defaultTaskQueue, workflowExecutionTimeout, workflowExecutionMaxWaiting } = temporalConfig;

const execute = async ( { handle, executionTimeout } ) => {
  try {
    const result = await Promise.race( [
      handle.result(),
      new Promise( ( _, rj ) => setTimeout( () => rj( new WorkflowExecutionTimedOutError() ), executionTimeout ) )
    ] );
    return { isFailure: false, result };
  } catch ( error ) {
    if ( error instanceof WorkflowFailedError ) {
      return { isFailure: true, error };
    }
    throw error;
  }
};

/**
 * Runs a workflow and return its result.
 *
 * The status field reflects Temporal's terminal workflow execution status.
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
    const { isFailure, result, error } = await execute( { handle, executionTimeout } );
    if ( isFailure ) {
      logger.warn( 'Workflow execution failed', { workflowId, errorMessage: error.message } );
    }
    const description = await handle.describe();
    if ( runId && description.firstRunId && description.firstRunId !== runId ) {
      throw new Error( `Workflow "${workflowId}" was reused before its result metadata could be read` );
    }
    const status = formatStatus( description.status.name );
    // Execution errors still return normally, with a built response
    return buildWorkflowResult( { workflowId, status, runId, input, result, memo: description.memo, error } );
  } catch ( error ) {
    // Throw errors unrelated to execution (timeout, not found, etc.)
    error.workflowId = workflowId;
    error.runId = runId;
    throw error;
  }
};
