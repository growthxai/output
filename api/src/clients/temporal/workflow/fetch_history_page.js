import { temporal as temporalConfig } from '#configs';
import { logger } from '#logger';
import { workflowNotFoundError } from '../../errors.js';
import { GrpcStatus } from '../types.js';

const { namespace } = temporalConfig;

/**
 * Fetch one page of a workflow's history, translating gRPC NOT_FOUND (and, when a mapper is
 * supplied, INVALID_ARGUMENT for a malformed/expired runId) into a run-aware error, and warning
 * once when Temporal returns no history field. Shared by get_input and get_result so the
 * not-found + missing-history handling lives in one place instead of being copy-pasted.
 *
 * @param {object} connection - Temporal connection exposing `workflowService`
 * @param {string} workflowId
 * @param {string} runId - Resolved run id to fetch
 * @param {object} [options]
 * @param {number} [options.maximumPageSize]
 * @param {Buffer} [options.nextPageToken]
 * @param {(error: object) => Error} [options.mapInvalidArgument] - Maps a gRPC INVALID_ARGUMENT
 *   (e.g. a malformed/expired runId) to a domain error; when omitted the raw error propagates.
 * @returns {Promise<object>} The raw getWorkflowExecutionHistory response
 */
export const fetchHistoryPage = async (
  connection, workflowId, runId,
  { maximumPageSize, nextPageToken, mapInvalidArgument } = {}
) => {
  const response = await connection.workflowService.getWorkflowExecutionHistory( {
    namespace,
    execution: { workflowId, runId },
    maximumPageSize,
    nextPageToken
  } ).catch( error => {
    if ( error?.code === GrpcStatus.NOT_FOUND ) {
      throw workflowNotFoundError( workflowId, runId );
    }
    if ( mapInvalidArgument && error?.code === GrpcStatus.INVALID_ARGUMENT ) {
      throw mapInvalidArgument( error );
    }
    throw error;
  } );

  if ( !response.history ) {
    logger.warn( 'Temporal getWorkflowExecutionHistory returned no history field', { workflowId, runId } );
  }

  return response;
};
