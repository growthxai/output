/**
 * Handler for trace log endpoint
 * Fetches trace data from workflow result and returns appropriate response
 */

import { fetchTraceFromS3 } from '../clients/s3_client.js';

/**
 * @typedef {Object} TraceLogRemoteResponse
 * @property {"remote"} source - Source type indicator
 * @property {Object} data - Trace data from S3
 */

/**
 * @typedef {Object} TraceLogLocalResponse
 * @property {"local"} source - Source type indicator
 * @property {string} localPath - Absolute path to local trace file
 */

/**
 * @typedef {TraceLogRemoteResponse | TraceLogLocalResponse} TraceLogResponse
 */

/**
 * Create trace log handler with injected temporal client
 * @param {Object} client - Temporal client instance
 * @returns {Function} Express request handler
 */
export function createTraceLogHandler( client ) {
  /**
   * Handle GET /workflow/:id/trace-log request
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   * @returns {Promise<void>}
   */
  return async ( req, res, next ) => {
    try {
      const workflowId = req.params.id;
      const result = await client.getWorkflowResult( workflowId );

      const localPath = result?.trace?.destinations?.local;
      const remotePath = result?.trace?.destinations?.remote;

      if ( remotePath ) {
        const data = await fetchTraceFromS3( remotePath );
        return res.json( { source: 'remote', data } );
      }

      if ( localPath ) {
        return res.json( { source: 'local', localPath } );
      }

      return res.status( 404 ).json( { error: 'No trace available for this workflow' } );
    } catch ( error ) {
      return next( error );
    }
  };
}
