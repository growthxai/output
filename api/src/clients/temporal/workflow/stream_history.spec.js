import { describe, it, expect, vi, beforeEach } from 'vitest';
import { streamHistory, TERMINAL_REASONS } from './stream_history.js';

const { mockIsGrpcCancelledError } = vi.hoisted( () => ( {
  mockIsGrpcCancelledError: vi.fn( err => err?._cancelled === true )
} ) );

vi.mock( '@temporalio/client', () => ( {
  defaultPayloadConverter: { fromPayload: vi.fn( p => p ) },
  isGrpcCancelledError: mockIsGrpcCancelledError,
  WorkflowNotFoundError: class WorkflowNotFoundError extends Error {
    constructor( message ) {
      super( message );
      this.name = 'WorkflowNotFoundError';
    }
  }
} ) );

vi.mock( '#configs', () => ( {
  temporal: { namespace: 'default' }
} ) );

vi.mock( '#logger', () => ( {
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
} ) );

const mockDescribe = vi.fn();
const mockGetWorkflowExecutionHistory = vi.fn();
const mockWithAbortSignal = vi.fn( async ( _signal, fn ) => fn() );
const mockGetHandle = vi.fn();

const context = {
  client: { workflow: { getHandle: mockGetHandle } },
  connection: {
    workflowService: { getWorkflowExecutionHistory: mockGetWorkflowExecutionHistory },
    withAbortSignal: mockWithAbortSignal
  }
};

beforeEach( () => {
  vi.clearAllMocks();
  mockGetHandle.mockReturnValue( { describe: mockDescribe } );
} );

describe( 'streamHistory', () => {
  const baseDescription = {
    runId: 'run-abc',
    status: { code: 1, name: 'RUNNING' },
    startTime: new Date( '2024-04-15T12:00:00.000Z' ),
    closeTime: null,
    historyLength: 10,
    taskQueue: 'default'
  };

  const makeEvent = ( eventId, eventType, extra = {} ) => ( {
    eventId,
    eventType,
    eventTime: { seconds: 1713182400, nanos: 0 },
    ...extra
  } );

  const collectStream = async gen => {
    const chunks = [];
    for await ( const chunk of gen ) {
      chunks.push( chunk );
    }
    return chunks;
  };

  it( 'yields workflow metadata from describe', async () => {
    mockDescribe.mockResolvedValue( baseDescription );
    mockGetWorkflowExecutionHistory.mockResolvedValue( {
      history: { events: [ makeEvent( 1, 2 ) ] },
      nextPageToken: undefined
    } );

    const gen = streamHistory( context, 'wf-1' );

    const first = await gen.next();
    expect( first.value.type ).toBe( 'workflow' );
    expect( first.value.workflow ).toMatchObject( {
      workflowId: 'wf-1',
      runId: 'run-abc',
      status: 'running',
      historyLength: 10,
      taskQueue: 'default',
      closed: false
    } );
  } );

  it( 'marks the workflow chunk closed for a terminal status', async () => {
    mockDescribe.mockResolvedValue( { ...baseDescription, status: { code: 2, name: 'COMPLETED' } } );
    mockGetWorkflowExecutionHistory.mockResolvedValue( {
      history: { events: [ makeEvent( 1, 2 ) ] },
      nextPageToken: undefined
    } );

    const first = await streamHistory( context, 'wf-1' ).next();

    expect( first.value.workflow.closed ).toBe( true );
  } );

  it( 'yields events in batches and ends with done on terminal event', async () => {
    mockDescribe.mockResolvedValue( baseDescription );
    mockGetWorkflowExecutionHistory.mockResolvedValue( {
      history: { events: [ makeEvent( 1, 1 ), makeEvent( 2, 2 ) ] },
      nextPageToken: undefined
    } );

    const chunks = await collectStream( streamHistory( context, 'wf-1' ) );

    expect( chunks[0].type ).toBe( 'workflow' );
    expect( chunks[1].type ).toBe( 'history' );
    expect( chunks[1].events ).toHaveLength( 2 );
    expect( chunks[1].lastEventId ).toBe( 2 );
    expect( chunks[2] ).toEqual( { type: 'done', reason: 'WORKFLOW_EXECUTION_COMPLETED', newRunId: undefined } );
  } );

  it( 'filters events by lastEventId on reconnect', async () => {
    mockDescribe.mockResolvedValue( baseDescription );
    mockGetWorkflowExecutionHistory.mockResolvedValue( {
      history: { events: [ makeEvent( 1, 1 ), makeEvent( 2, 1 ), makeEvent( 3, 2 ) ] },
      nextPageToken: undefined
    } );

    const chunks = await collectStream( streamHistory( context, 'wf-1', { lastEventId: 2 } ) );

    const eventChunk = chunks.find( c => c.type === 'history' );
    expect( eventChunk.events ).toHaveLength( 1 );
    expect( Number( eventChunk.events[0].eventId ) ).toBe( 3 );
  } );

  it( 'skips empty batches when all events are filtered by lastEventId', async () => {
    mockDescribe.mockResolvedValue( baseDescription );
    mockGetWorkflowExecutionHistory
      .mockResolvedValueOnce( {
        history: { events: [ makeEvent( 1, 1 ), makeEvent( 2, 1 ) ] },
        nextPageToken: Buffer.from( 'token' )
      } )
      .mockResolvedValueOnce( {
        history: { events: [ makeEvent( 3, 2 ) ] },
        nextPageToken: undefined
      } );

    const chunks = await collectStream( streamHistory( context, 'wf-1', { lastEventId: 2 } ) );

    const eventChunks = chunks.filter( c => c.type === 'history' );
    expect( eventChunks ).toHaveLength( 1 );
    expect( Number( eventChunks[0].events[0].eventId ) ).toBe( 3 );
  } );

  it( 'drains nextPageToken pages before yielding done', async () => {
    mockDescribe.mockResolvedValue( baseDescription );
    mockGetWorkflowExecutionHistory
      .mockResolvedValueOnce( {
        history: { events: [ makeEvent( 1, 1 ), makeEvent( 2, 2 ) ] },
        nextPageToken: Buffer.from( 'token' )
      } )
      .mockResolvedValueOnce( {
        history: { events: [ makeEvent( 3, 7 ) ] },
        nextPageToken: undefined
      } );

    const chunks = await collectStream( streamHistory( context, 'wf-1' ) );

    const eventChunks = chunks.filter( c => c.type === 'history' );
    expect( eventChunks ).toHaveLength( 2 );
    const done = chunks.find( c => c.type === 'done' );
    expect( done.reason ).toBe( 'WORKFLOW_EXECUTION_COMPLETED' );
  } );

  it.each( [
    { reason: 'WORKFLOW_EXECUTION_COMPLETED', eventType: 2, attrKey: 'workflowExecutionCompletedEventAttributes' },
    { reason: 'WORKFLOW_EXECUTION_FAILED', eventType: 3, attrKey: 'workflowExecutionFailedEventAttributes' },
    { reason: 'WORKFLOW_EXECUTION_TIMED_OUT', eventType: 4, attrKey: 'workflowExecutionTimedOutEventAttributes' },
    { reason: 'WORKFLOW_EXECUTION_CANCELED', eventType: 21, attrKey: null },
    { reason: 'WORKFLOW_EXECUTION_TERMINATED', eventType: 27, attrKey: null },
    { reason: 'WORKFLOW_EXECUTION_CONTINUED_AS_NEW', eventType: 28, attrKey: 'workflowExecutionContinuedAsNewEventAttributes' }
  ] )( 'yields done with reason $reason from terminal event $eventType', async ( { reason, eventType, attrKey } ) => {
    mockDescribe.mockResolvedValue( baseDescription );
    const extra = attrKey ? { [attrKey]: { newExecutionRunId: 'next-run-id' } } : {};
    mockGetWorkflowExecutionHistory.mockResolvedValue( {
      history: { events: [ makeEvent( 1, eventType, extra ) ] },
      nextPageToken: undefined
    } );

    const chunks = await collectStream( streamHistory( context, 'wf-1' ) );

    const done = chunks.find( c => c.type === 'done' );
    expect( done.type ).toBe( 'done' );
    expect( done.reason ).toBe( reason );
    expect( TERMINAL_REASONS.has( done.reason ) ).toBe( true );
    if ( attrKey ) {
      expect( done.newRunId ).toBe( 'next-run-id' );
    } else {
      expect( done.newRunId ).toBeUndefined();
    }
  } );

  it( 'exits silently on abort (gRPC CANCELLED)', async () => {
    mockDescribe.mockResolvedValue( baseDescription );
    const cancelledError = Object.assign( new Error( 'Cancelled' ), { _cancelled: true } );
    mockGetWorkflowExecutionHistory.mockRejectedValue( cancelledError );

    const chunks = await collectStream( streamHistory( context, 'wf-1' ) );

    expect( chunks ).toHaveLength( 1 );
    expect( chunks[0].type ).toBe( 'workflow' );
  } );

  it( 'throws non-cancelled gRPC errors', async () => {
    mockDescribe.mockResolvedValue( baseDescription );
    const grpcError = new Error( 'Unavailable' );
    mockGetWorkflowExecutionHistory.mockRejectedValue( grpcError );

    await expect( collectStream( streamHistory( context, 'wf-1' ) ) )
      .rejects
      .toThrow( 'Unavailable' );
  } );

  it( 're-issues waitNewEvent after empty response (timeout)', async () => {
    mockDescribe.mockResolvedValue( baseDescription );
    mockGetWorkflowExecutionHistory
      .mockResolvedValueOnce( { history: { events: [] }, nextPageToken: undefined } )
      .mockResolvedValueOnce( { history: { events: [ makeEvent( 1, 2 ) ] }, nextPageToken: undefined } );

    const chunks = await collectStream( streamHistory( context, 'wf-1' ) );

    expect( mockGetWorkflowExecutionHistory ).toHaveBeenCalledTimes( 2 );
    expect( chunks.find( c => c.type === 'done' ) ).toBeDefined();
  } );

  it( 'keeps long-polling across multiple empty responses until a terminal event', async () => {
    mockDescribe.mockResolvedValue( baseDescription );
    mockGetWorkflowExecutionHistory
      .mockResolvedValueOnce( { history: { events: [] }, nextPageToken: undefined } )
      .mockResolvedValueOnce( { history: { events: [] }, nextPageToken: undefined } )
      .mockResolvedValueOnce( { history: { events: [] }, nextPageToken: undefined } )
      .mockResolvedValueOnce( { history: { events: [ makeEvent( 1, 2 ) ] }, nextPageToken: undefined } );

    const chunks = await collectStream( streamHistory( context, 'wf-1' ) );

    expect( mockGetWorkflowExecutionHistory ).toHaveBeenCalledTimes( 4 );
    expect( chunks.find( c => c.type === 'done' ).reason ).toBe( 'WORKFLOW_EXECUTION_COMPLETED' );
  } );

  it( 'does not re-emit delivered events when an empty long-poll resets the page token', async () => {
    mockDescribe.mockResolvedValue( baseDescription );
    mockGetWorkflowExecutionHistory
      // first poll delivers events 1-2 (open workflow, no terminal yet)
      .mockResolvedValueOnce( {
        history: { events: [ makeEvent( 1, 1 ), makeEvent( 2, 1 ) ] },
        nextPageToken: undefined
      } )
      // empty long-poll timeout: token stays empty, next fetch re-reads from the start
      .mockResolvedValueOnce( {
        history: { events: [ makeEvent( 1, 1 ), makeEvent( 2, 1 ) ] },
        nextPageToken: undefined
      } )
      // new event 3 arrives and terminates the workflow
      .mockResolvedValueOnce( {
        history: { events: [ makeEvent( 1, 1 ), makeEvent( 2, 1 ), makeEvent( 3, 2 ) ] },
        nextPageToken: undefined
      } );

    const chunks = await collectStream( streamHistory( context, 'wf-1' ) );

    const emitted = chunks
      .filter( c => c.type === 'history' )
      .flatMap( c => c.events.map( e => Number( e.eventId ) ) );
    expect( emitted ).toEqual( [ 1, 2, 3 ] );
  } );

  it( 'wraps gRPC calls with abortSignal via connection.withAbortSignal', async () => {
    mockDescribe.mockResolvedValue( baseDescription );
    mockGetWorkflowExecutionHistory.mockResolvedValue( {
      history: { events: [ makeEvent( 1, 2 ) ] },
      nextPageToken: undefined
    } );

    const ctrl = new AbortController();
    await collectStream( streamHistory( context, 'wf-1', { abortSignal: ctrl.signal } ) );

    expect( mockWithAbortSignal ).toHaveBeenCalledWith( ctrl.signal, expect.any( Function ) );
  } );

  it( 'translates gRPC NOT_FOUND on describe to WorkflowNotFoundError', async () => {
    const notFoundError = Object.assign( new Error( 'Not found' ), { code: 5 } );
    mockDescribe.mockRejectedValue( notFoundError );

    await expect( streamHistory( context, 'wf-missing' ).next() )
      .rejects
      .toMatchObject( { name: 'WorkflowNotFoundError' } );
  } );

  it( 'yields done when terminal event was filtered by lastEventId (replay complete)', async () => {
    mockDescribe.mockResolvedValue( baseDescription );
    mockGetWorkflowExecutionHistory.mockResolvedValue( {
      history: { events: [ makeEvent( 1, 1 ), makeEvent( 2, 2 ) ] },
      nextPageToken: undefined
    } );

    // lastEventId=2 filters out both events (including the terminal COMPLETED); should still get done
    const chunks = await collectStream( streamHistory( context, 'wf-1', { lastEventId: 2 } ) );

    const done = chunks.find( c => c.type === 'done' );
    expect( done ).toEqual( { type: 'done', reason: 'WORKFLOW_EXECUTION_COMPLETED', newRunId: undefined } );
  } );

  it.each( [
    { statusCode: 4, statusName: 'CANCELLED', eventType: 21, expectedReason: 'WORKFLOW_EXECUTION_CANCELED' },
    { statusCode: 5, statusName: 'TERMINATED', eventType: 27, expectedReason: 'WORKFLOW_EXECUTION_TERMINATED' }
  ] )( 'reconnect past a closed $statusName reads history and yields done', async ( { statusCode, statusName, eventType, expectedReason } ) => {
    mockDescribe.mockResolvedValue( {
      ...baseDescription,
      status: { code: statusCode, name: statusName },
      historyLength: 5
    } );
    mockGetWorkflowExecutionHistory.mockResolvedValue( {
      history: { events: [ makeEvent( 5, eventType ) ] },
      nextPageToken: undefined
    } );

    const chunks = await collectStream( streamHistory( context, 'wf-1', { lastEventId: 5 } ) );

    expect( mockGetWorkflowExecutionHistory ).toHaveBeenCalled();
    const done = chunks.find( c => c.type === 'done' );
    expect( done ).toEqual( { type: 'done', reason: expectedReason, newRunId: undefined } );
    expect( TERMINAL_REASONS.has( done.reason ) ).toBe( true );
  } );

  it.each( [
    { statusCode: 2, statusName: 'COMPLETED', eventType: 2, attrKey: 'workflowExecutionCompletedEventAttributes' },
    { statusCode: 3, statusName: 'FAILED', eventType: 3, attrKey: 'workflowExecutionFailedEventAttributes' },
    { statusCode: 7, statusName: 'TIMED_OUT', eventType: 4, attrKey: 'workflowExecutionTimedOutEventAttributes' },
    { statusCode: 6, statusName: 'CONTINUED_AS_NEW', eventType: 28, attrKey: 'workflowExecutionContinuedAsNewEventAttributes' }
  ] )( 'reconnect past a closed $statusName surfaces newRunId from the terminal event', async ( { statusCode, statusName, eventType, attrKey } ) => {
    mockDescribe.mockResolvedValue( {
      ...baseDescription,
      status: { code: statusCode, name: statusName },
      historyLength: 5
    } );
    mockGetWorkflowExecutionHistory.mockResolvedValue( {
      history: { events: [ makeEvent( 1, eventType, { [attrKey]: { newExecutionRunId: 'chained-run' } } ) ] },
      nextPageToken: undefined
    } );

    const chunks = await collectStream( streamHistory( context, 'wf-1', { lastEventId: 5 } ) );

    expect( mockGetWorkflowExecutionHistory ).toHaveBeenCalled();
    const done = chunks.find( c => c.type === 'done' );
    expect( done.newRunId ).toBe( 'chained-run' );
  } );
} );
