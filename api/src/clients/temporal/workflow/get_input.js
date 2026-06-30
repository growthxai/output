import { workflowNotFoundError } from '../../errors.js';
import { describeWorkflow } from './describe_workflow.js';
import { extractWorkflowInput } from './get_result.js';
import { fetchHistoryPage } from './fetch_history_page.js';

/**
 * Returns the first input argument a workflow execution was *originally* started with.
 *
 * Unlike getResult, this works for workflows in any state (including running): the input lives
 * in the first history event (WorkflowExecutionStarted), available the moment the workflow
 * starts. For a continue-as-new chain an unpinned (latest-run) read lands on a continuation
 * whose start event holds the continuation args, so we follow firstExecutionRunId back to the
 * chain's first run to return the truly-original input. A pinned runId is returned verbatim.
 * Fetching a single-event page keeps each call cheap (extractWorkflowInput reads payloads[0]).
 *
 * @param {string} workflowId - The workflow execution id
 * @param {string} [runId] - Optional specific run id; defaults to the original run of the chain
 * @returns {Promise<{ workflowId: string, runId: string, input: any }>}
 * @throws {WorkflowNotFoundError}
 */
export const getInput = async ( { client, connection }, workflowId, runId ) => {
  // For a pinned runId the run is already known, so skip the describe round-trip; the history
  // fetch's NOT_FOUND/INVALID_ARGUMENT handling surfaces a clean 404 for a missing, expired, or
  // malformed run. Only the unpinned path needs describe to resolve a concrete run.
  const resolvedRunId = runId ?? await ( async () => {
    const { description } = await describeWorkflow( { client }, workflowId );
    if ( !description.runId ) {
      // Temporal should always report a runId; fail loudly rather than silently fall back to an
      // unpinned (latest-run) read, which would race continueAsNew and drop the runId field.
      throw new Error( `Temporal did not report a runId for workflow "${workflowId}"` );
    }
    return description.runId;
  } )();

  const firstPage = await fetchHistoryPage( connection, workflowId, resolvedRunId, {
    maximumPageSize: 1,
    mapInvalidArgument: () => workflowNotFoundError( workflowId, resolvedRunId )
  } );

  // An unpinned read resolves the *latest* run; for a continue-as-new chain that run's start
  // event holds the continuation args, not the input the workflow was originally started with.
  // firstExecutionRunId points at the chain's first run, so re-fetch it to honor "original".
  const firstExecutionRunId = firstPage.history?.events?.[0]
    ?.workflowExecutionStartedEventAttributes?.firstExecutionRunId;
  if ( !runId && firstExecutionRunId && firstExecutionRunId !== resolvedRunId ) {
    const originalPage = await fetchHistoryPage( connection, workflowId, firstExecutionRunId, { maximumPageSize: 1 } );
    return { workflowId, runId: firstExecutionRunId, input: extractWorkflowInput( originalPage.history ) };
  }

  return { workflowId, runId: resolvedRunId, input: extractWorkflowInput( firstPage.history ) };
};
