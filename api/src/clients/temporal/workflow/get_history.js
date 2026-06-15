import { temporal as temporalConfig } from '#configs';
import { logger } from '#logger';
import { WorkflowNotFoundError, InvalidPageTokenError } from '../../errors.js';
import { decodeEventPayloads, serializeEvent } from '../../event_serialization.js';
import { formatStatus, GrpcStatus } from '../types.js';

const { namespace } = temporalConfig;

/**
 * Serialized info about a workflow execution
 * @typedef {object} WorkflowInfo
 * @property {string} workflowId
 * @property {string} runId
 * @property {string} status
 * @property {string} startTime
 * @property {string} closeTime
 * @property {number} historyLength
 * @property {string} taskQuery
 */
/**
 * A representation of a workflow execution result, including input, output, error and meta information
 * @typedef {object} WorkflowHistoryResults
 * @property {WorkflowInfo} workflow
 * @property {object[]} events - Temporal workflow history events
 * @property {string} runId - The run id of the workflow execution
 * @property {string} nextPageToken - Token to retrieve next page
 */

/**
 * Retrieves workflow execution history.
 *
 * @param {string} workflowId
 * @param {object} options
 * @param {object} options.runId - Specific workflow run to retrieve, will fallback to first if omitted
 * @param {object} options.pageSize - Amount of results default=20
 * @param {object} options.pageToken - Used to retrieve next page, must be used together with runId
 * @param {object} options.includePayloads - Omit/display payloads, default=false
 * @returns {WorkflowHistoryResults}
 */
export const getHistory = async ( { client, connection }, workflowId, options = {} ) => {
  const { runId, pageSize = 20, pageToken, includePayloads = false } = options ?? {};

  if ( pageToken && !runId ) {
    throw new InvalidPageTokenError();
  }

  const isFirstPage = !pageToken;
  const metadata = isFirstPage ? await ( async () => {
    const handle = client.workflow.getHandle( workflowId, runId );
    const description = await handle.describe().catch( error => {
      if ( error?.code === GrpcStatus.NOT_FOUND ) {
        throw new WorkflowNotFoundError( runId ?
          `Run "${runId}" not found for workflow "${workflowId}"` :
          `Workflow "${workflowId}" not found`
        );
      }
      throw error;
    } );
    return {
      workflow: {
        workflowId,
        runId: description.runId,
        status: formatStatus( description.status.name ),
        startTime: description.startTime?.toISOString() ?? null,
        closeTime: description.closeTime?.toISOString() ?? null,
        historyLength: description.historyLength,
        taskQueue: description.taskQueue
      },
      resolvedRunId: description.runId
    };
  } )() : { workflow: null, resolvedRunId: runId };

  const response = await connection.workflowService.getWorkflowExecutionHistory( {
    namespace,
    execution: { workflowId, runId: metadata.resolvedRunId },
    maximumPageSize: Math.min( pageSize, 50 ),
    nextPageToken: pageToken ? Buffer.from( pageToken, 'base64' ) : undefined
  } ).catch( error => {
    if ( !error ) {
      throw new Error( 'Temporal getWorkflowExecutionHistory rejected with no error' );
    }
    if ( error.code === GrpcStatus.NOT_FOUND ) {
      throw new WorkflowNotFoundError( runId ?
        `Run "${runId}" not found for workflow "${workflowId}"` :
        `Workflow "${workflowId}" not found`
      );
    }
    if ( error.code === GrpcStatus.INVALID_ARGUMENT ) {
      throw new InvalidPageTokenError();
    }
    throw error;
  } );

  if ( !response.history ) {
    logger.warn( 'Temporal getWorkflowExecutionHistory returned no history field', { workflowId, runId: metadata.resolvedRunId } );
  }

  const events = ( response.history?.events || [] ).map( event => {
    const decoded = includePayloads ? decodeEventPayloads( event ) : event;
    return serializeEvent( decoded, { includePayloads } );
  } );

  const nextPageToken = response.history && response.nextPageToken?.length ?
    Buffer.from( response.nextPageToken ).toString( 'base64' ) :
    null;

  return {
    workflow: metadata.workflow,
    events,
    runId: metadata.resolvedRunId,
    nextPageToken
  };
};
