/**
 * Stops a workflow execution (graceful cancellation; workflow may run cleanup).
 *
 * @param {string} workflowId  - The workflow execution id
 * @param {string} [runId] - Optional specific run id; defaults to the latest run
 * @returns {{ workflowId: string, runId: string }} The stopped workflow id and the run id that was actually targeted.
 * @throws {WorkflowNotFoundError}
 */
export const stop = async ( { client }, workflowId, runId ) => {
  const handle = client.workflow.getHandle( workflowId, runId );
  await handle.cancel();
  if ( runId ) {
    return { workflowId, runId };
  }
  const description = await handle.describe();
  const resolvedRunId = description.runId;
  if ( !resolvedRunId ) {
    throw new Error( `Temporal did not report a runId for workflow "${workflowId}"` );
  }
  return { workflowId, runId: resolvedRunId };
};
