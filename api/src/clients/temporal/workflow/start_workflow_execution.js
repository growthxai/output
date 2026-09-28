/**
 * Single call site for starting a Temporal workflow execution.
 *
 * @param {object} client - Temporal client
 * @param {string} resolvedName - Resolved workflow type name
 * @param {object} startOptions - `client.workflow.start` options (args, taskQueue, workflowId, ...)
 * @returns {Promise<object>} The Temporal workflow handle
 */
export const startWorkflowExecution = ( client, resolvedName, startOptions ) =>
  client.workflow.start( resolvedName, startOptions );
