import { formatStatus } from '../types.js';

/**
 * @typedef {Object} WorkflowStatus
 * @property {string} workflowId - The workflow execution id
 * @property {string|null} runId - The specific run id for this execution
 * @property {string} status - The workflow execution status
 * @property {number} startedAt - The start date of the workflow execution
 * @property {number} completedAt - The end date of the workflow execution
 */
/**
 * Returns the status of a workflow execution
 *
 * @param {string} workflowId
 * @param {string} [runId] - Optional specific run id; defaults to the latest run
 * @returns {WorkflowStatus}
 * @throws WorkflowNotFoundError
 */
export const getStatus = async ( { client }, workflowId, runId ) => {
  const handle = client.workflow.getHandle( workflowId, runId );
  const description = await handle.describe();

  return {
    workflowId,
    runId: description.runId,
    status: formatStatus( description.status.name ),
    startedAt: description.startTime ? new Date( description.startTime ).getTime() : '',
    completedAt: description.closeTime ? new Date( description.closeTime ).getTime() : ''
  };
};
