/**
 * Handler for the trace-attributes endpoint.
 *
 * Returns a single aggregated payload per workflow run — runtime, start/finish
 * timestamps, cost rolled up by event-name bucket, token-usage totals, and the
 * underlying trace URL. Completion-only: 424 when the workflow is still
 * running (via `WorkflowNotCompletedError` from `getWorkflowResult`), 404 when
 * the workflow id is unknown, 404 with `TraceNotAvailableError` only when the
 * run produced no trace at all (neither remote nor local). Local-mode traces
 * are read off disk so `output dev` has parity with production — same as
 * `/trace-log` already does.
 */

import { readFile } from 'node:fs/promises';
import { aggregateTraceAttributes } from '@outputai/core/sdk_tracing_tools';
import { fetchTraceFromS3 } from '../clients/s3_client.js';
import { TraceFileParseError, TraceNotAvailableError } from '../clients/errors.js';
import { readPinnedRunId } from './utils.js';

/**
 * @typedef {object} TraceAttributesResponse
 * @property {string} workflowId
 * @property {string} runId
 * @property {number|null} startTime - ms epoch from the root trace node
 * @property {number|null} finishTime - ms epoch from the root trace node
 * @property {number|null} runtime - ms (finishTime - startTime), null if either is missing
 * @property {{ cost: { total: number, components: Array<{ name: string, value: number }> },
 *              tokenUsage: { inputTokens: number, outputTokens: number, cachedInputTokens: number, totalTokens: number } }} attributes
 * @property {string} traceUrl - S3 URL or local path of the underlying trace file
 */

const computeRuntime = ( startedAt, endedAt ) => {
  if ( typeof startedAt === 'number' && typeof endedAt === 'number' ) {
    return endedAt - startedAt;
  }
  return null;
};

/**
 * Read and parse a local trace JSON file written by `output dev`. Throws
 * `TraceFileParseError` on malformed JSON to match the S3 path's error shape.
 *
 * @param {string} localPath
 * @returns {Promise<object>}
 */
const fetchTraceFromLocal = async localPath => {
  const content = await readFile( localPath, 'utf8' );
  try {
    return JSON.parse( content );
  } catch ( error ) {
    throw new TraceFileParseError( 'Invalid trace file', localPath, error );
  }
};

/**
 * Resolve the trace tree and its source URL from a workflow result. Mirrors
 * the destination-precedence in `/trace-log` (remote wins over local) and
 * returns `null` when neither destination is set so the caller can 404.
 *
 * @param {{ trace?: { destinations?: { remote?: string|null, local?: string|null } } }} result
 * @returns {Promise<{ traceTree: object, traceUrl: string }|null>}
 */
const loadTrace = async result => {
  const remotePath = result?.trace?.destinations?.remote;
  if ( remotePath ) {
    return { traceTree: await fetchTraceFromS3( remotePath ), traceUrl: remotePath };
  }
  const localPath = result?.trace?.destinations?.local;
  if ( localPath ) {
    return { traceTree: await fetchTraceFromLocal( localPath ), traceUrl: localPath };
  }
  return null;
};

/**
 * Create the trace-attributes handler with an injected temporal client.
 * Mounted at both the latest-run shortcut and the pinned-run route, mirroring
 * `/trace-log`.
 *
 * @param {object} client - Temporal client (provides `getWorkflowResult`).
 * @returns {Function} Express request handler
 */
export function createTraceAttributesHandler( client ) {
  return async ( req, res, next ) => {
    try {
      const workflowId = req.params.id;
      const runId = readPinnedRunId( req );

      // 424 (still running) and 404 (unknown id) bubble up from here via the
      // standard error_handler middleware — same path /result and /trace-log use.
      const result = await client.getWorkflowResult( workflowId, runId );

      const trace = await loadTrace( result );
      if ( !trace ) {
        return next( new TraceNotAvailableError( workflowId ) );
      }
      const { traceTree } = trace;

      const startTime = typeof traceTree?.startedAt === 'number' ? traceTree.startedAt : null;
      const finishTime = typeof traceTree?.endedAt === 'number' ? traceTree.endedAt : null;

      return res.json( {
        workflowId,
        runId: result.runId,
        startTime,
        finishTime,
        runtime: computeRuntime( startTime, finishTime ),
        attributes: aggregateTraceAttributes( traceTree ),
        traceUrl: trace.traceUrl
      } );
    } catch ( error ) {
      return next( error );
    }
  };
}
