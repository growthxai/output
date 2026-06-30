import { z } from 'zod';
import { isGrpcCancelledError } from '@temporalio/client';
import { logger } from '#logger';
import { WorkflowStreamProtocolError } from '../clients/errors.js';
import { readPinnedRunId } from './utils.js';

// A client disconnect can race a genuine fault from the stream. We downgrade such masked
// errors to `info` (the client can't receive them anyway) — except programming errors, which
// are bugs regardless of the disconnect and must stay at `error` level so alerting sees them.
const isProgrammingError = error =>
  error instanceof TypeError || error instanceof RangeError || error instanceof ReferenceError;

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

    // Node collapses a repeated Last-Event-ID header into one comma-joined string
    // ("15, 15"), which fails numeric parsing and would silently replay from event 1.
    // Take the last token (the freshest high-water mark) before parsing.
    const rawHeaderId = req.headers['last-event-id'];
    const lastHeaderToken = Array.isArray( rawHeaderId ) ?
      rawHeaderId.at( -1 ) :
      rawHeaderId?.split( ',' ).at( -1 )?.trim();
    const headerLastEventId = lastHeaderToken !== undefined ?
      lastEventIdSchema.safeParse( lastHeaderToken ).data :
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

    // The first next() resolves describe() before any header is sent. A client that drops
    // here aborts the describe, surfacing as CANCELLED. Bail quietly rather than letting it
    // escape to the global error handler as a 500 written to an already-closed socket.
    const firstResult = await stream.next().catch( error => {
      if ( isGrpcCancelledError( error ) || ctrl.signal.aborted ) {
        return { aborted: true };
      }
      throw error;
    } );
    if ( firstResult.aborted ) {
      return;
    }

    const { value: firstChunk, done } = firstResult;
    if ( done || firstChunk?.type !== 'workflow' ) {
      throw new WorkflowStreamProtocolError( workflowId );
    }

    // runId from the query is only present on the /runs/:rid route; on the bare history
    // stream route it is undefined. Use the run Temporal actually resolved so logs and the
    // server_error payload always carry it.
    const resolvedRunId = firstChunk.workflow.runId;

    // Reconnect at/after the terminal event of an already-closed workflow: nothing left to
    // stream. Replying 200 text/event-stream and re-sending `done` would make a browser
    // EventSource reconnect (~3s) and receive `done` again, looping. A 204 (non-200) tells
    // EventSource to stop. Decided before flushHeaders, while the status can still change.
    if (
      firstChunk.workflow.closed &&
      lastEventId !== undefined &&
      lastEventId >= firstChunk.workflow.historyLength
    ) {
      res.status( 204 ).end();
      return;
    }

    res.set( {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    } );
    res.flushHeaders();
    res.on( 'error', err => {
      logger.info( 'SSE response stream error', { workflowId, runId: resolvedRunId, message: err.message } );
      ctrl.abort();
    } );

    // Single guarded writer for every SSE frame. res.write can throw synchronously
    // (e.g. ERR_STREAM_DESTROYED) in the window between socket destruction and
    // writableEnded being set; unguarded, that throw escapes post-flush to the global
    // error handler (headers already sent) or, from the keepalive timer, becomes an
    // uncaughtException. Returns false once the socket can no longer be written so callers
    // can stop. Treats a failed write as a disconnect: aborts the stream and stops.
    const safeWrite = frame => {
      if ( res.writableEnded ) {
        return false;
      }
      try {
        res.write( frame );
        return true;
      } catch ( err ) {
        logger.info( 'SSE write failed', { workflowId, runId: resolvedRunId, message: err.message } );
        ctrl.abort();
        return false;
      }
    };

    if ( !safeWrite( `event: workflow\ndata: ${JSON.stringify( firstChunk.workflow )}\n\n` ) ) {
      return;
    }

    const keepalive = setInterval( () => {
      if ( !safeWrite( ': keepalive\n\n' ) ) {
        clearInterval( keepalive );
      }
    }, 15_000 );

    try {
      for await ( const chunk of stream ) {
        if ( chunk.type === 'history' ) {
          if ( !safeWrite( `id: ${chunk.lastEventId}\nevent: history\ndata: ${JSON.stringify( chunk.events )}\n\n` ) ) {
            break;
          }
        } else if ( chunk.type === 'done' ) {
          const payload = { reason: chunk.reason };
          if ( chunk.newRunId ) {
            payload.newRunId = chunk.newRunId;
          }
          safeWrite( `event: done\ndata: ${JSON.stringify( payload )}\n\n` );
          break;
        }
      }
    } catch ( error ) {
      if ( isGrpcCancelledError( error ) ) {
        // Pure cancellation from gRPC client teardown: nothing to log.
      } else if ( ctrl.signal.aborted && !isProgrammingError( error ) ) {
        // Real (transport/Temporal) error masked by client disconnect — log at info so it
        // stays observable without paging on something the client can no longer receive.
        logger.info( 'SSE stream error suppressed by client disconnect', {
          workflowId, runId: resolvedRunId, error: error.constructor.name, message: error.message
        } );
      } else {
        logger.error( 'SSE stream error', {
          workflowId, runId: resolvedRunId, error: error.constructor.name, message: error.message
        } );
        const payload = { error: error.constructor.name, message: error.message, workflowId, runId: resolvedRunId };
        safeWrite( `event: server_error\ndata: ${JSON.stringify( payload )}\n\n` );
      }
    } finally {
      clearInterval( keepalive );
      if ( !res.writableEnded ) {
        res.end();
      }
    }
  };
}
