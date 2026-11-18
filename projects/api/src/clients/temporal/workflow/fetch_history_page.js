import { isGrpcDeadlineError } from '@temporalio/client';
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
 * @param {object} connection - Temporal connection exposing `workflowService` and `withDeadline`
 * @param {string} workflowId
 * @param {string} runId - Resolved run id to fetch
 * @param {object} [options]
 * @param {number} [options.maximumPageSize]
 * @param {Buffer} [options.nextPageToken]
 * @param {(error: object) => Error} [options.mapInvalidArgument] - Maps a gRPC INVALID_ARGUMENT
 *   (e.g. a malformed/expired runId) to a domain error; when omitted the raw error propagates.
 * @param {boolean} [options.waitNewEvent] - Long-poll: block server-side until a new event
 *   exists past this page, up to `deadlineMs`. Only blocks when this page is already at the
 *   current end of history; returns immediately if more is already buffered.
 * @param {number} [options.deadlineMs] - Bounds how long a `waitNewEvent` call may block.
 *   Required when `waitNewEvent` is true.
 * @returns {Promise<object|null>} The raw getWorkflowExecutionHistory response, or `null` if
 *   `waitNewEvent` was requested and the deadline elapsed with no new event.
 */
export const fetchHistoryPage = async (
  connection, workflowId, runId,
  { maximumPageSize, nextPageToken, mapInvalidArgument, waitNewEvent, deadlineMs } = {}
) => {
  const call = () => connection.workflowService.getWorkflowExecutionHistory( {
    namespace,
    execution: { workflowId, runId },
    maximumPageSize,
    nextPageToken,
    ...( waitNewEvent ? { waitNewEvent: true } : {} )
  } );

  const response = await ( waitNewEvent ? connection.withDeadline( Date.now() + deadlineMs, call ) : call() )
    .catch( error => {
      if ( !error ) {
        throw new Error( 'Temporal getWorkflowExecutionHistory rejected with no error' );
      }
      if ( waitNewEvent && isGrpcDeadlineError( error ) ) {
        return null;
      }
      if ( error.code === GrpcStatus.NOT_FOUND ) {
        throw workflowNotFoundError( workflowId, runId );
      }
      if ( mapInvalidArgument && error.code === GrpcStatus.INVALID_ARGUMENT ) {
        throw mapInvalidArgument( error );
      }
      throw error;
    } );

  if ( response === null ) {
    return null;
  }

  if ( !response.history ) {
    logger.warn( 'Temporal getWorkflowExecutionHistory returned no history field', { workflowId, runId } );
  }

  return response;
};
