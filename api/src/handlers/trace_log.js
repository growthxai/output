/**
 * Handler for trace log endpoint
 * Fetches trace data from workflow result and returns appropriate response
 */

import { z } from 'zod';
import { fetchTraceFromS3 } from '../clients/s3_client.js';
import { TraceNotAvailableError } from '../clients/errors.js';

const runIdPathSchema = z.string().uuid();

/**
 * @typedef {Object} TraceLogRemoteResponse
 * @property {"remote"} source - Source type indicator
 * @property {string} runId - The run id this trace belongs to
 * @property {Object} data - Trace data from S3
 */

/**
 * @typedef {Object} TraceLogLocalResponse
 * @property {"local"} source - Source type indicator
 * @property {string} runId - The run id this trace belongs to
 * @property {string} localPath - Absolute path to local trace file
 */

/**
 * @typedef {TraceLogRemoteResponse | TraceLogLocalResponse} TraceLogResponse
 */

/**
 * Create trace log handler with injected temporal client.
 * The handler supports both the shortcut route (`/workflow/:id/trace-log`, always latest)
 * and the pinned route (`/workflow/:id/runs/:rid/trace-log`, specific run).
 *
 * @param {Object} client - Temporal client instance
 * @returns {Function} Express request handler
 */
export function createTraceLogHandler( client ) {
  return async ( req, res, next ) => {
    try {
      const workflowId = req.params.id;
      const runId = req.params.rid ? runIdPathSchema.parse( req.params.rid ) : undefined;
      const result = await client.getWorkflowResult( workflowId, runId );

      const localPath = result?.trace?.destinations?.local;
      const remotePath = result?.trace?.destinations?.remote;

      if ( remotePath ) {
        const data = await fetchTraceFromS3( remotePath );
        return res.json( { source: 'remote', runId: result.runId, data } );
      }

      if ( localPath ) {
        return res.json( { source: 'local', runId: result.runId, localPath } );
      }

      return next( new TraceNotAvailableError( workflowId ) );
    } catch ( error ) {
      return next( error );
    }
  };
}
