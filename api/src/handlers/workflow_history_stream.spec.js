import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createWorkflowHistoryStreamHandler } from './workflow_history_stream.js';

const { mockIsGrpcCancelledError, MockWorkflowNotFoundError, mockLoggerError, mockLoggerInfo } = vi.hoisted( () => {
  const mockIsGrpcCancelledError = vi.fn( err => err?._cancelled === true );
  const mockLoggerError = vi.fn();
  const mockLoggerInfo = vi.fn();
  class MockWorkflowNotFoundError extends Error {
    constructor( message ) {
      super( message );
      this.name = 'WorkflowNotFoundError';
    }
  }
  return { mockIsGrpcCancelledError, MockWorkflowNotFoundError, mockLoggerError, mockLoggerInfo };
} );

vi.mock( '@temporalio/client', () => ( {
  isGrpcCancelledError: mockIsGrpcCancelledError,
  WorkflowNotFoundError: MockWorkflowNotFoundError
} ) );

vi.mock( '#logger', () => ( {
  logger: { error: mockLoggerError, info: mockLoggerInfo, warn: vi.fn() }
} ) );

const RID = '11111111-2222-4333-8444-555555555555';

const makeWorkflow = ( overrides = {} ) => ( {
  workflowId: 'wf-1',
  runId: 'run-abc',
  status: 'running',
  startTime: '2024-04-15T12:00:00.000Z',
  closeTime: null,
  historyLength: 10,
  taskQueue: 'default',
  ...overrides
} );

const makeEvent = ( eventId, eventTypeName = 'WORKFLOW_EXECUTION_STARTED' ) => ( {
  eventId: String( eventId ),
  eventType: 1,
  eventTypeName,
  eventTime: '2024-04-15T12:00:00.000Z'
} );

async function *simpleStream( workflow, eventBatches = [], done = { reason: 'WORKFLOW_EXECUTION_COMPLETED' } ) {
  yield { type: 'workflow', workflow };
  for ( const batch of eventBatches ) {
    yield { type: 'history', events: batch, lastEventId: Number( batch[batch.length - 1].eventId ) };
  }
  yield { type: 'done', ...done };
}

const createApp = mockStream => {
  const mockClient = { workflow: { streamHistory: mockStream } };
  const app = express();
  const handler = createWorkflowHistoryStreamHandler( mockClient );
  app.get( '/workflow/:id/history/stream', handler );
  app.get( '/workflow/:id/runs/:rid/history/stream', handler );
  app.use( ( err, _req, res, _next ) => {
    if ( err.name === 'ZodError' ) {
      res.status( 400 ).json( { error: 'ValidationError', issues: err.issues } );
      return;
    }
    if ( err.name === 'WorkflowNotFoundError' ) {
      res.status( 404 ).json( { error: err.name, message: err.message } );
      return;
    }
    res.status( 500 ).json( { error: err.message } );
  } );
  return app;
};

describe( 'workflow_history_stream handler', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  describe( 'SSE format and basic flow', () => {
    it( 'returns 200 with text/event-stream content type', async () => {
      const workflow = makeWorkflow();
      const mockStream = vi.fn( () => simpleStream( workflow ) );

      const res = await request( createApp( mockStream ) )
        .get( '/workflow/wf-1/history/stream' )
        .expect( 200 );

      expect( res.headers['content-type'] ).toMatch( /text\/event-stream/ );
    } );

    it( 'emits workflow metadata as first SSE event', async () => {
      const workflow = makeWorkflow();
      const mockStream = vi.fn( () => simpleStream( workflow ) );

      const res = await request( createApp( mockStream ) )
        .get( '/workflow/wf-1/history/stream' )
        .expect( 200 );

      expect( res.text ).toContain( 'event: workflow\n' );
      expect( res.text ).toContain( JSON.stringify( workflow ) );
    } );

    it( 'emits history events with id and event: history', async () => {
      const workflow = makeWorkflow();
      const events = [ makeEvent( 5 ), makeEvent( 7 ) ];
      const mockStream = vi.fn( () => simpleStream( workflow, [ events ] ) );

      const res = await request( createApp( mockStream ) )
        .get( '/workflow/wf-1/history/stream' )
        .expect( 200 );

      expect( res.text ).toContain( 'id: 7\n' );
      expect( res.text ).toContain( 'event: history\n' );
      expect( res.text ).toContain( JSON.stringify( events ) );
    } );

    it( 'emits done event when stream completes', async () => {
      const mockStream = vi.fn( () => simpleStream( makeWorkflow() ) );

      const res = await request( createApp( mockStream ) )
        .get( '/workflow/wf-1/history/stream' )
        .expect( 200 );

      expect( res.text ).toContain( 'event: done\n' );
      expect( res.text ).toContain( '"reason":"WORKFLOW_EXECUTION_COMPLETED"' );
    } );

    it( 'includes newRunId in done event for continue-as-new', async () => {
      const mockStream = vi.fn( () => simpleStream(
        makeWorkflow(),
        [],
        { reason: 'WORKFLOW_EXECUTION_CONTINUED_AS_NEW', newRunId: 'new-run-xyz' }
      ) );

      const res = await request( createApp( mockStream ) )
        .get( '/workflow/wf-1/history/stream' )
        .expect( 200 );

      expect( res.text ).toContain( '"newRunId":"new-run-xyz"' );
    } );

    it( 'omits newRunId from done event when not present', async () => {
      const mockStream = vi.fn( () => simpleStream( makeWorkflow() ) );

      const res = await request( createApp( mockStream ) )
        .get( '/workflow/wf-1/history/stream' )
        .expect( 200 );

      expect( res.text ).not.toContain( 'newRunId' );
    } );
  } );

  describe( 'pre-flush error handling', () => {
    it( 'returns 404 JSON when workflow not found (before headers sent)', async () => {
      const notFound = new MockWorkflowNotFoundError( 'Workflow "wf-missing" not found' );
      const mockStream = vi.fn( () => {
        // Simulate generator that throws on first next() (during describe)
        return ( async function *() {
          throw notFound;
        } )();
      } );

      const res = await request( createApp( mockStream ) )
        .get( '/workflow/wf-missing/history/stream' )
        .expect( 404 );

      expect( res.headers['content-type'] ).toMatch( /json/ );
      expect( res.body.error ).toBe( 'WorkflowNotFoundError' );
    } );

    it( 'returns 400 for invalid includePayloads value', async () => {
      const mockStream = vi.fn();

      await request( createApp( mockStream ) )
        .get( '/workflow/wf-1/history/stream?includePayloads=yes' )
        .expect( 400 );

      expect( mockStream ).not.toHaveBeenCalled();
    } );

    it( 'returns 400 for non-integer lastEventId', async () => {
      const mockStream = vi.fn();

      await request( createApp( mockStream ) )
        .get( '/workflow/wf-1/history/stream?lastEventId=abc' )
        .expect( 400 );

      expect( mockStream ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'post-flush error handling', () => {
    it( 'emits server_error event on post-flush gRPC failure', async () => {
      class ServiceUnavailableError extends Error {
        constructor() {
          super( 'service down' );
        }
      }
      const mockStream = vi.fn( () => ( async function *() {
        yield { type: 'workflow', workflow: makeWorkflow() };
        throw new ServiceUnavailableError();
      } )() );

      const res = await request( createApp( mockStream ) )
        .get( '/workflow/wf-1/history/stream' )
        .expect( 200 );

      expect( res.text ).toContain( 'event: server_error\n' );
      expect( res.text ).toContain( '"error":"ServiceUnavailableError"' );
    } );

    it( 'ends silently on gRPC cancelled error (client disconnect)', async () => {
      const cancelledError = Object.assign( new Error( 'Cancelled' ), { _cancelled: true } );
      const mockStream = vi.fn( () => ( async function *() {
        yield { type: 'workflow', workflow: makeWorkflow() };
        throw cancelledError;
      } )() );

      const res = await request( createApp( mockStream ) )
        .get( '/workflow/wf-1/history/stream' )
        .expect( 200 );

      expect( res.text ).not.toContain( 'event: server_error' );
    } );

    it( 'logs at info but writes no server_error when real error races with client disconnect', async () => {
      const closeHandlers = [];
      const fakeReq = {
        params: { id: 'wf-1' },
        query: {},
        headers: {},
        on: vi.fn( ( evt, cb ) => {
          if ( evt === 'close' ) {
            closeHandlers.push( cb );
          }
        } )
      };
      const writes = [];
      const fakeRes = {
        headersSent: false,
        writableEnded: false,
        set: vi.fn(),
        flushHeaders: vi.fn( () => {
          fakeRes.headersSent = true;
        } ),
        write: vi.fn( chunk => {
          writes.push( chunk );
        } ),
        end: vi.fn( () => {
          fakeRes.writableEnded = true;
        } ),
        on: vi.fn()
      };

      const gateRef = { resolve: null };
      const realError = new Error( 'INTERNAL: server fault' );
      const stream = ( async function *() {
        yield { type: 'workflow', workflow: makeWorkflow() };
        await new Promise( resolve => {
          gateRef.resolve = resolve;
        } );
        throw realError;
      } )();

      const mockClient = { workflow: { streamHistory: vi.fn( () => stream ) } };
      const handler = createWorkflowHistoryStreamHandler( mockClient );

      const handlerPromise = handler( fakeReq, fakeRes );
      await Promise.resolve();
      await Promise.resolve();

      closeHandlers[0]();

      gateRef.resolve();
      await handlerPromise;

      expect( writes.some( c => typeof c === 'string' && c.includes( 'event: server_error' ) ) ).toBe( false );
      expect( mockLoggerInfo ).toHaveBeenCalledWith(
        'SSE stream error suppressed by client disconnect',
        expect.objectContaining( { workflowId: 'wf-1', message: 'INTERNAL: server fault' } )
      );
      expect( mockLoggerError ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'query params and client call args', () => {
    it( 'passes workflowId and default options to client', async () => {
      const mockStream = vi.fn( () => simpleStream( makeWorkflow() ) );

      await request( createApp( mockStream ) )
        .get( '/workflow/my-wf/history/stream' )
        .expect( 200 );

      expect( mockStream ).toHaveBeenCalledWith( 'my-wf', expect.objectContaining( {
        includePayloads: false,
        lastEventId: undefined
      } ) );
    } );

    it( 'passes includePayloads=true when specified', async () => {
      const mockStream = vi.fn( () => simpleStream( makeWorkflow() ) );

      await request( createApp( mockStream ) )
        .get( '/workflow/wf-1/history/stream?includePayloads=true' )
        .expect( 200 );

      expect( mockStream ).toHaveBeenCalledWith( 'wf-1', expect.objectContaining( {
        includePayloads: true
      } ) );
    } );

    it( 'passes lastEventId from query param', async () => {
      const mockStream = vi.fn( () => simpleStream( makeWorkflow() ) );

      await request( createApp( mockStream ) )
        .get( '/workflow/wf-1/history/stream?lastEventId=42' )
        .expect( 200 );

      expect( mockStream ).toHaveBeenCalledWith( 'wf-1', expect.objectContaining( {
        lastEventId: 42
      } ) );
    } );

    it( 'reads lastEventId from Last-Event-ID header when query param absent', async () => {
      const mockStream = vi.fn( () => simpleStream( makeWorkflow() ) );

      await request( createApp( mockStream ) )
        .get( '/workflow/wf-1/history/stream' )
        .set( 'Last-Event-ID', '15' )
        .expect( 200 );

      expect( mockStream ).toHaveBeenCalledWith( 'wf-1', expect.objectContaining( {
        lastEventId: 15
      } ) );
    } );

    it( 'query param lastEventId takes precedence over Last-Event-ID header', async () => {
      const mockStream = vi.fn( () => simpleStream( makeWorkflow() ) );

      await request( createApp( mockStream ) )
        .get( '/workflow/wf-1/history/stream?lastEventId=99' )
        .set( 'Last-Event-ID', '15' )
        .expect( 200 );

      expect( mockStream ).toHaveBeenCalledWith( 'wf-1', expect.objectContaining( {
        lastEventId: 99
      } ) );
    } );

    it( 'ignores non-numeric Last-Event-ID header', async () => {
      const mockStream = vi.fn( () => simpleStream( makeWorkflow() ) );

      await request( createApp( mockStream ) )
        .get( '/workflow/wf-1/history/stream' )
        .set( 'Last-Event-ID', 'abc' )
        .expect( 200 );

      expect( mockStream ).toHaveBeenCalledWith( 'wf-1', expect.objectContaining( {
        lastEventId: undefined
      } ) );
    } );

    it( 'ignores Last-Event-ID header value of 0', async () => {
      const mockStream = vi.fn( () => simpleStream( makeWorkflow() ) );

      await request( createApp( mockStream ) )
        .get( '/workflow/wf-1/history/stream' )
        .set( 'Last-Event-ID', '0' )
        .expect( 200 );

      expect( mockStream ).toHaveBeenCalledWith( 'wf-1', expect.objectContaining( {
        lastEventId: undefined
      } ) );
    } );
  } );

  describe( 'pinned run route /workflow/:id/runs/:rid/history/stream', () => {
    it( 'passes runId from path to client', async () => {
      const mockStream = vi.fn( () => simpleStream( makeWorkflow() ) );

      await request( createApp( mockStream ) )
        .get( `/workflow/wf-1/runs/${RID}/history/stream` )
        .expect( 200 );

      expect( mockStream ).toHaveBeenCalledWith( 'wf-1', expect.objectContaining( {
        runId: RID
      } ) );
    } );

    it( 'rejects non-UUID rid with 400', async () => {
      const mockStream = vi.fn();

      await request( createApp( mockStream ) )
        .get( '/workflow/wf-1/runs/not-a-uuid/history/stream' )
        .expect( 400 );

      expect( mockStream ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'client disconnect', () => {
    it( 'aborts the stream signal when req emits close', async () => {
      const closeHandlers = [];
      const fakeReq = {
        params: { id: 'wf-1' },
        query: {},
        headers: {},
        on: vi.fn( ( evt, cb ) => {
          if ( evt === 'close' ) {
            closeHandlers.push( cb );
          }
        } )
      };
      const fakeRes = {
        headersSent: false,
        writableEnded: false,
        set: vi.fn(),
        flushHeaders: vi.fn( () => {
          fakeRes.headersSent = true;
        } ),
        write: vi.fn(),
        end: vi.fn( () => {
          fakeRes.writableEnded = true;
        } ),
        on: vi.fn()
      };

      const resolverRef = { resolve: null };
      const slowStream = ( async function *() {
        yield { type: 'workflow', workflow: makeWorkflow() };
        await new Promise( resolve => {
          resolverRef.resolve = resolve;
        } );
        yield { type: 'done', reason: 'WORKFLOW_EXECUTION_COMPLETED' };
      } )();

      const capturedSignals = [];
      const mockClient = {
        workflow: {
          streamHistory: vi.fn( ( _id, opts ) => {
            capturedSignals.push( opts.abortSignal );
            return slowStream;
          } )
        }
      };
      const handler = createWorkflowHistoryStreamHandler( mockClient );

      const handlerPromise = handler( fakeReq, fakeRes );
      await Promise.resolve();
      await Promise.resolve();

      expect( closeHandlers ).toHaveLength( 1 );
      expect( capturedSignals[0].aborted ).toBe( false );

      closeHandlers[0]();

      expect( capturedSignals[0].aborted ).toBe( true );

      resolverRef.resolve();
      await handlerPromise;
    } );
  } );

  describe( 'keepalive', () => {
    beforeEach( () => {
      vi.useFakeTimers();
    } );

    afterEach( () => {
      vi.useRealTimers();
    } );

    it( 'emits keepalive comment every 15 seconds', async () => {
      const written = [];
      const fakeRes = {
        headersSent: false,
        writableEnded: false,
        set: vi.fn(),
        flushHeaders: vi.fn( () => {
          fakeRes.headersSent = true;
        } ),
        write: vi.fn( chunk => {
          written.push( chunk );
        } ),
        end: vi.fn( () => {
          fakeRes.writableEnded = true;
        } ),
        on: vi.fn()
      };
      const fakeReq = {
        params: { id: 'wf-1' },
        query: {},
        headers: {},
        on: vi.fn()
      };

      const resolverRef = { resolve: null };
      const slowStream = ( async function *() {
        yield { type: 'workflow', workflow: makeWorkflow() };
        await new Promise( resolve => {
          resolverRef.resolve = resolve;
        } );
        yield { type: 'done', reason: 'WORKFLOW_EXECUTION_COMPLETED' };
      } )();

      const mockClient = { workflow: { streamHistory: vi.fn( () => slowStream ) } };
      const handler = createWorkflowHistoryStreamHandler( mockClient );

      const handlerPromise = handler( fakeReq, fakeRes );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      vi.advanceTimersByTime( 15_000 );
      resolverRef.resolve();
      await handlerPromise;

      expect( written.some( chunk => chunk === ': keepalive\n\n' ) ).toBe( true );
      expect( vi.getTimerCount() ).toBe( 0 );
    } );

    it( 'aborts and logs info when keepalive write throws synchronously', async () => {
      const closeHandlers = [];
      const fakeReq = {
        params: { id: 'wf-1' },
        query: {},
        headers: {},
        on: vi.fn( ( evt, cb ) => {
          if ( evt === 'close' ) {
            closeHandlers.push( cb );
          }
        } )
      };
      const fakeRes = {
        headersSent: false,
        writableEnded: false,
        set: vi.fn(),
        flushHeaders: vi.fn( () => {
          fakeRes.headersSent = true;
        } ),
        write: vi.fn( chunk => {
          if ( chunk === ': keepalive\n\n' ) {
            const err = new Error( 'ERR_STREAM_DESTROYED' );
            err.code = 'ERR_STREAM_DESTROYED';
            throw err;
          }
        } ),
        end: vi.fn( () => {
          fakeRes.writableEnded = true;
        } ),
        on: vi.fn()
      };

      const resolverRef = { resolve: null };
      const slowStream = ( async function *() {
        yield { type: 'workflow', workflow: makeWorkflow() };
        await new Promise( resolve => {
          resolverRef.resolve = resolve;
        } );
        yield { type: 'done', reason: 'WORKFLOW_EXECUTION_COMPLETED' };
      } )();

      const capturedSignals = [];
      const mockClient = {
        workflow: {
          streamHistory: vi.fn( ( _id, opts ) => {
            capturedSignals.push( opts.abortSignal );
            return slowStream;
          } )
        }
      };
      const handler = createWorkflowHistoryStreamHandler( mockClient );

      const handlerPromise = handler( fakeReq, fakeRes );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      vi.advanceTimersByTime( 15_000 );

      expect( capturedSignals[0].aborted ).toBe( true );
      expect( mockLoggerInfo ).toHaveBeenCalledWith(
        'SSE keepalive write failed',
        expect.objectContaining( { workflowId: 'wf-1', message: 'ERR_STREAM_DESTROYED' } )
      );

      resolverRef.resolve();
      await handlerPromise;
    } );
  } );
} );
