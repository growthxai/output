import { temporal as temporalConfig } from '#configs';
import { InvalidPageTokenError } from '../../errors.js';
import { decodeEventPayloads, serializeEvent } from '../../event_serialization.js';
import { describeWorkflow } from './describe_workflow.js';
import { fetchHistoryPage } from './fetch_history_page.js';

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
 * @param {boolean} [options.wait] - Long-poll for a new event when already caught up to the
 *   end of history, bounded by `temporal.historyWaitTimeoutMs`, instead of returning
 *   immediately. Lets a resumable poller (`workflow monitor`) avoid restarting from page 1
 *   on every tick.
 * @param {number} [options.waitMs] - Caller-requested upper bound (ms) for a `wait` long-poll,
 *   letting a poller keep the block roughly aligned with its own poll cadence instead of
 *   always blocking for the full `temporal.historyWaitTimeoutMs`. Clamped to that value —
 *   callers can shorten the long-poll, never lengthen it past the server's configured cap.
 * @returns {WorkflowHistoryResults}
 */
export const getHistory = async ( { client, connection }, workflowId, options = {} ) => {
  const { runId, pageSize = 20, pageToken, includePayloads = false, wait = false, waitMs } = options ?? {};

  if ( pageToken && !runId ) {
    throw new InvalidPageTokenError();
  }

  // Re-describe on every `wait` call, not just the first page: a resumable poller
  // (`workflow monitor`) never requests the first page again, so if metadata were only
  // fetched there, `workflow.status` would freeze at whatever it was on the very first
  // poll and the caller could never observe the run finishing.
  const shouldDescribe = !pageToken || wait;
  const metadata = shouldDescribe ? await ( async () => {
    const { workflow } = await describeWorkflow( { client }, workflowId, { runId } );
    return { workflow, resolvedRunId: workflow.runId };
  } )() : { workflow: null, resolvedRunId: runId };

  const response = await fetchHistoryPage( connection, workflowId, metadata.resolvedRunId, {
    maximumPageSize: Math.min( pageSize, 50 ),
    nextPageToken: pageToken ? Buffer.from( pageToken, 'base64' ) : undefined,
    mapInvalidArgument: () => new InvalidPageTokenError(),
    ...( wait ? {
      waitNewEvent: true,
      deadlineMs: waitMs ? Math.min( waitMs, temporalConfig.historyWaitTimeoutMs ) : temporalConfig.historyWaitTimeoutMs
    } : {} )
  } );

  if ( response === null ) {
    // Long-poll deadline elapsed with no new events. Return the cursor unchanged so the
    // caller can retry from the same position instead of losing its place.
    return {
      workflow: metadata.workflow,
      events: [],
      runId: metadata.resolvedRunId,
      nextPageToken: pageToken ?? null
    };
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
