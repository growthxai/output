import { takeFromAsyncIterable } from '#utils';
import { formatStatus } from '../types.js';

/**
 * Workflow run info
 * @typedef {Object} WorkflowRunInfo
 * @property {string} workflowId - The workflow execution id
 * @property {string} runId - The specific run id for this execution
 * @property {string} workflowType - The workflow type/name
 * @property {string} status - The workflow execution status
 * @property {string} startedAt - The start date of the workflow execution (ISO 8601)
 * @property {string|null} completedAt - The end date of the workflow execution (ISO 8601) or null if not completed
 */
/**
 * Workflow runs list result
 * @typedef {Object} WorkflowRunsListResult
 * @property {WorkflowRunInfo[]} runs - List of workflow runs
 * @property {number} count - Number of runs returned
 */
/**
 * Lists workflow runs with optional filtering
 *
 * @param {Object} [options] - Optional configuration
 * @param {string} [options.workflowType] - Filter by workflow type/name
 * @param {string} [options.taskQueue] - Filter by Temporal task queue name
 * @param {number} [options.limit=100] - Maximum number of runs to return
 * @returns {WorkflowRunsListResult}
 */
export const listRuns = async ( { client }, options = {} ) => {
  const { workflowType, taskQueue, limit = 100 } = options;

  const conditions = [];
  if ( workflowType ) {
    conditions.push( `WorkflowType = "${workflowType}"` );
  }
  if ( taskQueue ) {
    conditions.push( `TaskQueue = "${taskQueue}"` );
  }
  const query = conditions.length > 0 ? conditions.join( ' AND ' ) : undefined;

  const executions = await takeFromAsyncIterable(
    client.workflow.list( { query } ),
    limit
  );

  const runs = executions.map( execution => ( {
    workflowId: execution.workflowId,
    runId: execution.runId,
    workflowType: execution.type,
    status: formatStatus( execution.status.name ),
    startedAt: execution.startTime.toISOString(),
    completedAt: execution.closeTime?.toISOString() ?? null
  } ) );

  return { runs, count: runs.length };
};
