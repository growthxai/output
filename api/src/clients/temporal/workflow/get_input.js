import { temporal as temporalConfig } from '#configs';
import { workflowNotFoundError } from '../../errors.js';
import { GrpcStatus } from '../types.js';
import { describeWorkflow } from './describe_workflow.js';
import { extractWorkflowInput } from './get_result.js';

const { namespace } = temporalConfig;

/**
 * Returns the original input of a workflow execution.
 *
 * Unlike getResult, this works for workflows in any state (including running): the input
 * lives in the first history event (WorkflowExecutionStarted), available the moment the
 * workflow starts. Fetching a single-event page keeps the call cheap.
 *
 * @param {string} workflowId - The workflow execution id
 * @param {string} [runId] - Optional specific run id; defaults to the latest run
 * @returns {Promise<{ workflowId: string, runId: string, input: any }>}
 * @throws {WorkflowNotFoundError}
 */
export const getInput = async ( { client, connection }, workflowId, runId ) => {
  const { description } = await describeWorkflow( { client }, workflowId, { runId } );
  const resolvedRunId = description.runId;

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

  return { workflowId, runId: resolvedRunId, input: extractWorkflowInput( firstPage.history ) };
};
