/**
 * Terminates a workflow execution (force stop; no cleanup).
 *
 * @param {string} workflowId  - The workflow execution id
 * @param {string} [reason]    - Optional reason for termination
 * @param {string} [runId]     - Optional specific run id; defaults to the latest run
 * @returns {{ workflowId: string, runId: string }} The terminated workflow id and the run id that was actually targeted.
 * @throws {WorkflowNotFoundError}
 */
export const terminate = async ( { client }, workflowId, reason, runId ) => {
  const handle = client.workflow.getHandle( workflowId, runId );
  await handle.terminate( reason );
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
