import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvalidPageTokenError, WorkflowNotFoundError } from '../../errors.js';

const { mockLoggerWarn, mockDecodeEventPayloads, mockSerializeEvent } = vi.hoisted( () => ( {
  mockLoggerWarn: vi.fn(),
  mockDecodeEventPayloads: vi.fn(),
  mockSerializeEvent: vi.fn()
} ) );

vi.mock( '#configs', () => ( {
  temporal: { namespace: 'default' }
} ) );

vi.mock( '#logger', () => ( {
  logger: { warn: mockLoggerWarn }
} ) );

vi.mock( '../../event_serialization.js', () => ( {
  decodeEventPayloads: mockDecodeEventPayloads,
  serializeEvent: mockSerializeEvent
} ) );

describe( 'getHistory', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    mockDecodeEventPayloads.mockImplementation( event => ( { ...event, decoded: true } ) );
    mockSerializeEvent.mockImplementation( ( event, options ) => ( { event, options } ) );
  } );

  it( 'describes the workflow on the first page and returns serialized events with metadata', async () => {
    const event = { eventId: { toString: () => '1' }, eventType: 1 };
    const describe = vi.fn().mockResolvedValue( {
      runId: 'resolved-run',
      status: { name: 'RUNNING' },
      startTime: new Date( '2024-01-01T00:00:00.000Z' ),
      closeTime: null,
      historyLength: 10,
      taskQueue: 'queue-a'
    } );
    const getHandle = vi.fn().mockReturnValue( { describe } );
    const getWorkflowExecutionHistory = vi.fn().mockResolvedValue( {
      history: { events: [ event ] },
      nextPageToken: Buffer.from( 'next' )
    } );
    const client = { workflow: { getHandle } };
    const connection = { workflowService: { getWorkflowExecutionHistory } };
    const { getHistory } = await import( './get_history.js' );

    const result = await getHistory( { client, connection }, 'workflow-id', { pageSize: 30 } );

    expect( getHandle ).toHaveBeenCalledWith( 'workflow-id', undefined );
    expect( getWorkflowExecutionHistory ).toHaveBeenCalledWith( {
      namespace: 'default',
      execution: { workflowId: 'workflow-id', runId: 'resolved-run' },
      maximumPageSize: 30,
      nextPageToken: undefined
    } );
    expect( mockDecodeEventPayloads ).not.toHaveBeenCalled();
    expect( mockSerializeEvent ).toHaveBeenCalledWith( event, { includePayloads: false } );
    expect( result ).toEqual( {
      workflow: {
        workflowId: 'workflow-id',
        runId: 'resolved-run',
        status: 'running',
        startTime: '2024-01-01T00:00:00.000Z',
        closeTime: null,
        historyLength: 10,
        taskQueue: 'queue-a'
      },
      events: [ { event, options: { includePayloads: false } } ],
      runId: 'resolved-run',
      nextPageToken: Buffer.from( 'next' ).toString( 'base64' )
    } );
  } );

  it( 'requires runId when pageToken is supplied', async () => {
    const client = { workflow: { getHandle: vi.fn() } };
    const connection = { workflowService: { getWorkflowExecutionHistory: vi.fn() } };
    const { getHistory } = await import( './get_history.js' );

    await expect( getHistory( { client, connection }, 'workflow-id', { pageToken: 'abc' } ) ).rejects.toBeInstanceOf( InvalidPageTokenError );
  } );

  it( 'skips describe for later pages and decodes pageToken from base64', async () => {
    const getHandle = vi.fn();
    const getWorkflowExecutionHistory = vi.fn().mockResolvedValue( { history: { events: [] }, nextPageToken: null } );
    const client = { workflow: { getHandle } };
    const connection = { workflowService: { getWorkflowExecutionHistory } };
    const { getHistory } = await import( './get_history.js' );
    const pageToken = Buffer.from( 'previous-token' ).toString( 'base64' );

    const result = await getHistory( { client, connection }, 'workflow-id', { runId: 'run-id', pageToken } );

    expect( getHandle ).not.toHaveBeenCalled();
    expect( getWorkflowExecutionHistory ).toHaveBeenCalledWith( expect.objectContaining( {
      execution: { workflowId: 'workflow-id', runId: 'run-id' },
      nextPageToken: Buffer.from( pageToken, 'base64' )
    } ) );
    expect( result.workflow ).toBeNull();
    expect( result.runId ).toBe( 'run-id' );
  } );

  it( 'caps pageSize at 50 and decodes event payloads when requested', async () => {
    const rawEvent = { eventId: { toString: () => '1' }, eventType: 1 };
    const decodedEvent = { eventId: rawEvent.eventId, eventType: 1, decoded: true };
    mockDecodeEventPayloads.mockReturnValue( decodedEvent );
    const describe = vi.fn().mockResolvedValue( { runId: 'run-id', status: {}, historyLength: 1 } );
    const getWorkflowExecutionHistory = vi.fn().mockResolvedValue( { history: { events: [ rawEvent ] } } );
    const client = { workflow: { getHandle: vi.fn().mockReturnValue( { describe } ) } };
    const connection = { workflowService: { getWorkflowExecutionHistory } };
    const { getHistory } = await import( './get_history.js' );

    await getHistory( { client, connection }, 'workflow-id', { pageSize: 100, includePayloads: true } );

    expect( getWorkflowExecutionHistory ).toHaveBeenCalledWith( expect.objectContaining( { maximumPageSize: 50 } ) );
    expect( mockDecodeEventPayloads ).toHaveBeenCalledWith( rawEvent );
    expect( mockSerializeEvent ).toHaveBeenCalledWith( decodedEvent, { includePayloads: true } );
  } );

  it( 'maps NOT_FOUND from describe and history calls to WorkflowNotFoundError', async () => {
    const describeNotFound = Object.assign( new Error( 'not found' ), { code: 5 } );
    const historyNotFound = Object.assign( new Error( 'not found' ), { code: 5 } );
    const { getHistory } = await import( './get_history.js' );

    const missingDescribeClient = { workflow: { getHandle: vi.fn().mockReturnValue( { describe: vi.fn().mockRejectedValue( describeNotFound ) } ) } };
    const missingDescribeConnection = { workflowService: { getWorkflowExecutionHistory: vi.fn() } };
    await expect( getHistory( { client: missingDescribeClient, connection: missingDescribeConnection }, 'workflow-id' ) )
      .rejects.toBeInstanceOf( WorkflowNotFoundError );

    const missingPageClient = { workflow: { getHandle: vi.fn() } };
    const missingPageConnection = { workflowService: { getWorkflowExecutionHistory: vi.fn().mockRejectedValue( historyNotFound ) } };
    await expect( getHistory(
      { client: missingPageClient, connection: missingPageConnection },
      'workflow-id',
      { runId: 'run-id', pageToken: 'abc' }
    ) )
      .rejects.toBeInstanceOf( WorkflowNotFoundError );
  } );

  it( 'maps INVALID_ARGUMENT history errors to InvalidPageTokenError and propagates other errors', async () => {
    const invalidArgument = Object.assign( new Error( 'invalid' ), { code: 3 } );
    const unavailable = Object.assign( new Error( 'unavailable' ), { code: 14 } );
    const { getHistory } = await import( './get_history.js' );

    const invalidTokenClient = { workflow: { getHandle: vi.fn() } };
    const invalidTokenConnection = { workflowService: { getWorkflowExecutionHistory: vi.fn().mockRejectedValue( invalidArgument ) } };
    await expect( getHistory(
      { client: invalidTokenClient, connection: invalidTokenConnection },
      'workflow-id',
      { runId: 'run-id', pageToken: 'abc' }
    ) )
      .rejects.toBeInstanceOf( InvalidPageTokenError );

    const outageClient = { workflow: { getHandle: vi.fn() } };
    const outageConnection = { workflowService: { getWorkflowExecutionHistory: vi.fn().mockRejectedValue( unavailable ) } };
    await expect( getHistory( { client: outageClient, connection: outageConnection }, 'workflow-id', { runId: 'run-id', pageToken: 'abc' } ) )
      .rejects.toBe( unavailable );
  } );

  it( 'warns and suppresses pagination when Temporal returns no history field', async () => {
    const describe = vi.fn().mockResolvedValue( { runId: 'run-id', status: {}, historyLength: 0 } );
    const getWorkflowExecutionHistory = vi.fn().mockResolvedValue( { nextPageToken: Buffer.from( 'would-loop' ) } );
    const client = { workflow: { getHandle: vi.fn().mockReturnValue( { describe } ) } };
    const connection = { workflowService: { getWorkflowExecutionHistory } };
    const { getHistory } = await import( './get_history.js' );

    const result = await getHistory( { client, connection }, 'workflow-id' );

    expect( mockLoggerWarn ).toHaveBeenCalledWith(
      'Temporal getWorkflowExecutionHistory returned no history field',
      { workflowId: 'workflow-id', runId: 'run-id' }
    );
    expect( result.events ).toEqual( [] );
    expect( result.nextPageToken ).toBeNull();
  } );

  it( 'throws a clear error if the history RPC rejects without an error object', async () => {
    const client = { workflow: { getHandle: vi.fn() } };
    const connection = { workflowService: { getWorkflowExecutionHistory: vi.fn().mockRejectedValue( null ) } };
    const { getHistory } = await import( './get_history.js' );

    await expect( getHistory( { client, connection }, 'workflow-id', { runId: 'run-id', pageToken: 'abc' } ) )
      .rejects.toThrow( 'Temporal getWorkflowExecutionHistory rejected with no error' );
  } );
} );
