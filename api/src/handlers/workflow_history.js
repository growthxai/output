import { z } from 'zod';
import { readPinnedRunId } from './utils.js';

export function createWorkflowHistoryHandler( client ) {
  const querySchema = z.object( {
    runId: z.string().optional(),
    pageSize: z.coerce.number().int().min( 1 ).max( 50 ).default( 20 ),
    pageToken: z.preprocess(
      v => v === '' ? undefined : v,
      // pageToken is a base64-encoded Temporal pagination cursor
      z.string().max( 4096 ).regex( /^[A-Za-z0-9+/]+={0,2}$/, 'Invalid pageToken format' ).optional()
    ),
    includePayloads: z.union( [ z.literal( 'true' ), z.literal( 'false' ) ] ).default( 'false' ).transform( v => v === 'true' ),
    // When set (and positive), long-poll for a new event once caught up to the end of history
    // instead of returning immediately, bounding the block by this many milliseconds (clamped to
    // the server ceiling; see getHistory). Omit for an immediate response. Lets a resumable poller
    // avoid restarting from page 1 every tick.
    longPollTimeoutMs: z.coerce.number().int().positive().optional()
  } ).refine(
    data => !data.pageToken || data.runId,
    { message: 'runId is required when using pageToken', path: [ 'runId' ] }
  );

  return async ( req, res ) => {
    const workflowId = req.params.id;
    const pathRunId = readPinnedRunId( req );
    const { runId, pageSize, pageToken, includePayloads, longPollTimeoutMs } = querySchema.parse(
      pathRunId ? { ...req.query, runId: pathRunId } : req.query
    );

    const result = await client.workflow.getHistory( workflowId, {
      runId,
      pageSize,
      pageToken,
      includePayloads,
      longPollTimeoutMs
    } );

    res.json( result );
  };
}
