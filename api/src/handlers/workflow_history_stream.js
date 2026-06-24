import { z } from 'zod';
import { isGrpcCancelledError } from '@temporalio/client';
import { logger } from '#logger';
import { readPinnedRunId } from './utils.js';

export function createWorkflowHistoryStreamHandler( client ) {
  const lastEventIdSchema = z.coerce.number().int().positive();
  const querySchema = z.object( {
    runId: z.string().optional(),
    includePayloads: z.union( [ z.literal( 'true' ), z.literal( 'false' ) ] )
      .default( 'false' ).transform( v => v === 'true' ),
    lastEventId: lastEventIdSchema.optional()
  } );

  return async ( req, res ) => {
    const workflowId = req.params.id;
    const pathRunId = readPinnedRunId( req );
    const { runId, includePayloads, lastEventId: queryLastEventId } = querySchema.parse(
      pathRunId ? { ...req.query, runId: pathRunId } : req.query
    );

    const rawHeaderId = req.headers['last-event-id'];
    const headerLastEventId = rawHeaderId !== undefined ?
      lastEventIdSchema.safeParse( rawHeaderId ).data :
      undefined;
    const lastEventId = queryLastEventId ?? headerLastEventId;

    const ctrl = new AbortController();
    req.on( 'close', () => ctrl.abort() );

    const stream = client.workflow.streamHistory( workflowId, {
      runId,
      includePayloads,
      lastEventId,
      abortSignal: ctrl.signal
    } );

    const { value: firstChunk, done } = await stream.next();
    if ( done || firstChunk?.type !== 'workflow' ) {
      throw new Error( `streamHistory did not yield workflow metadata as first chunk (workflowId: ${workflowId})` );
    }

    res.set( {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    } );
    res.flushHeaders();
    res.on( 'error', err => {
      logger.info( 'SSE response stream error', { workflowId, runId, message: err.message } );
      ctrl.abort();
    } );

    res.write( `event: workflow\ndata: ${JSON.stringify( firstChunk.workflow )}\n\n` );
    const keepalive = setInterval( () => {
      if ( res.writableEnded ) {
        return;
      }
      try {
        res.write( ': keepalive\n\n' );
      } catch ( err ) {
        // res.write can throw synchronously (e.g. ERR_STREAM_DESTROYED) in the
        // window between socket destruction and writableEnded being set. A throw
        // from a setInterval callback would otherwise become uncaughtException.
        logger.info( 'SSE keepalive write failed', { workflowId, runId, message: err.message } );
        ctrl.abort();
        clearInterval( keepalive );
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
      if ( isGrpcCancelledError( error ) ) {
        // Pure cancellation from gRPC client teardown: nothing to log.
      } else if ( ctrl.signal.aborted ) {
        // Real error masked by client disconnect — log at info so it stays observable.
        logger.info( 'SSE stream error suppressed by client disconnect', {
          workflowId, runId, error: error.constructor.name, message: error.message
        } );
      } else {
        logger.error( 'SSE stream error', {
          workflowId, runId, error: error.constructor.name, message: error.message, stack: error.stack
        } );
        const payload = { error: error.constructor.name, message: error.message, workflowId, runId };
        res.write( `event: server_error\ndata: ${JSON.stringify( payload )}\n\n` );
      }
    } finally {
      clearInterval( keepalive );
      if ( !res.writableEnded ) {
        res.end();
      }
    }
  };
}
