import { temporal as temporalConfig } from '#configs';
import { buildWorkflowId } from '#utils';
import { getCatalog, resolveWorkflowName } from '../catalog.js';

const { defaultTaskQueue, workflowExecutionTimeout } = temporalConfig;

/**
 * Workflow start result
 *
 * @typedef {Object} WorkflowStartResult
 * @property {string} workflowId - The id of the started workflow
 * @property {string|null} runId - The first execution's run id, null if unavailable
 */
/**
 * Starts an workflow execution asynchronously
 *
 * @param {string} workflowName - The type of the workflow
 * @param {any} input - The input arguments of the workflow
 * @param {Object} [options] - Optional configuration
 * @param {string} [options.workflowId] - Optional custom workflow ID. If not provided, one will be generated.
 * @param {string} [options.taskQueue] - The task queue to send the workflow execution to. Fallbacks to the default task queue.
 * @returns {WorkflowStartResult}
 */
export const start = async ( { client }, workflowName, input, options = {} ) => {
  const { workflowId: userWorkflowId, taskQueue = defaultTaskQueue } = options;
  const catalog = await getCatalog( { client, taskQueue } );
  const resolvedName = resolveWorkflowName( catalog, workflowName, taskQueue );
  const workflowId = userWorkflowId ?? buildWorkflowId();
  const handle = await client.workflow.start( resolvedName, { args: [ input ], taskQueue, workflowId, workflowExecutionTimeout } );
  return { workflowId, runId: handle.firstExecutionRunId ?? null };
};
