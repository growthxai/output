import { z } from 'zod';
import { isGrpcCancelledError } from '@temporalio/client';
import { readPinnedRunId } from './utils.js';

export function createWorkflowHistoryStreamHandler( client ) {
  const querySchema = z.object( {
    runId: z.string().optional(),
    includePayloads: z.union( [ z.literal( 'true' ), z.literal( 'false' ) ] )
      .default( 'false' ).transform( v => v === 'true' ),
    lastEventId: z.coerce.number().int().positive().optional()
  } );

  return async ( req, res ) => {
    const workflowId = req.params.id;
    const pathRunId = readPinnedRunId( req );
    const { runId, includePayloads, lastEventId: queryLastEventId } = querySchema.parse(
      pathRunId ? { ...req.query, runId: pathRunId } : req.query
    );

    const headerLastEventId = req.headers['last-event-id'] ?
      parseInt( req.headers['last-event-id'], 10 ) || undefined :
      undefined;
    const lastEventId = queryLastEventId ?? headerLastEventId;

    const ctrl = new AbortController();
    const stream = client.streamWorkflowHistory( workflowId, {
      runId,
      includePayloads,
      lastEventId,
      abortSignal: ctrl.signal
    } );

    // Pull first yield (workflow metadata) before flushing headers.
    // If describe() throws (e.g. WorkflowNotFoundError), it propagates here
    // and Express 5 forwards it to errorHandler as a JSON response.
    const { value: firstChunk } = await stream.next();

    res.set( {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    } );
    res.flushHeaders();

    res.write( `event: workflow\ndata: ${JSON.stringify( firstChunk.workflow )}\n\n` );

    req.on( 'close', () => ctrl.abort() );
    const keepalive = setInterval( () => {
      if ( !res.writableEnded ) {
        res.write( ': keepalive\n\n' );
      }
    }, 15_000 );

    try {
      for await ( const chunk of stream ) {
        if ( chunk.type === 'events' ) {
          res.write( `id: ${chunk.lastEventId}\nevent: history\ndata: ${JSON.stringify( chunk.events )}\n\n` );
        } else if ( chunk.type === 'done' ) {
          const payload = { reason: chunk.reason };
          if ( chunk.newRunId ) {
            payload.newRunId = chunk.newRunId;
          }
          res.write( `event: done\ndata: ${JSON.stringify( payload )}\n\n` );
          break;
        }
      }
    } catch ( error ) {
      if ( !isGrpcCancelledError( error ) ) {
        res.write( `event: server_error\ndata: ${JSON.stringify( { error: error.constructor.name, message: error.message } )}\n\n` );
      }
    } finally {
      clearInterval( keepalive );
      if ( !res.writableEnded ) {
        res.end();
      }
    }
  };
}
