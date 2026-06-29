import { temporal as temporalConfig } from '#configs';
import { workflowNotFoundError } from '../../errors.js';
import { GrpcStatus } from '../types.js';
import { describeWorkflow } from './describe_workflow.js';
import { extractWorkflowInput } from './get_result.js';
import { logger } from '#logger';

const { namespace } = temporalConfig;

/**
 * Returns the first input argument a workflow execution was started with.
 *
 * Unlike getResult, this works for workflows in any state (including running): the input
 * lives in the first history event (WorkflowExecutionStarted), available the moment the
 * workflow starts. Fetching a single-event page keeps the call cheap. Only the first start
 * argument is decoded (extractWorkflowInput reads payloads[0]).
 *
 * @param {string} workflowId - The workflow execution id
 * @param {string} [runId] - Optional specific run id; defaults to the latest run
 * @returns {Promise<{ workflowId: string, runId: string, input: any }>}
 * @throws {WorkflowNotFoundError}
 */
export const getInput = async ( { client, connection }, workflowId, runId ) => {
  // A caller-supplied runId is already the run to read; only resolve the latest run via
  // describe when none was pinned, avoiding a needless DescribeWorkflowExecution RPC.
  const resolvedRunId = runId ?? ( await describeWorkflow( { client }, workflowId ) ).description.runId;
  if ( !resolvedRunId ) {
    // Temporal should always report a runId; fail loudly rather than silently fall back to an
    // unpinned (latest-run) read, which would race continueAsNew and drop the runId field.
    throw new Error( `Temporal did not report a runId for workflow "${workflowId}"` );
  }

  const firstPage = await connection.workflowService.getWorkflowExecutionHistory( {
    namespace,
    execution: { workflowId, runId: resolvedRunId },
    maximumPageSize: 1
  } ).catch( error => {
    if ( error?.code === GrpcStatus.NOT_FOUND ) {
      throw workflowNotFoundError( workflowId, resolvedRunId );
    }
    throw error;
  } );

  if ( !firstPage.history ) {
    logger.warn( 'Temporal getWorkflowExecutionHistory returned no history field', { workflowId, runId: resolvedRunId } );
  }

  return { workflowId, runId: resolvedRunId, input: extractWorkflowInput( firstPage.history ) };
};
