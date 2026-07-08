import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvalidPageTokenError } from '../../errors.js';

const {
  mockFormatStatus, mockLoggerWarn, mockDecodeEventPayloads, mockSerializeEvent,
  mockDescribeWorkflow, mockFetchHistoryPage
} = vi.hoisted( () => ( {
  mockFormatStatus: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockDecodeEventPayloads: vi.fn(),
  mockSerializeEvent: vi.fn(),
  mockDescribeWorkflow: vi.fn(),
  mockFetchHistoryPage: vi.fn()
} ) );

vi.mock( '#logger', () => ( {
  logger: { warn: mockLoggerWarn }
} ) );

vi.mock( '#configs', () => ( {
  temporal: { historyWaitTimeoutMs: 15_000 }
} ) );

vi.mock( '../../event_serialization.js', () => ( {
  decodeEventPayloads: mockDecodeEventPayloads,
  serializeEvent: mockSerializeEvent
} ) );

vi.mock( '../types.js', async importOriginal => ( {
  ...( await importOriginal() ),
  formatStatus: mockFormatStatus
} ) );

vi.mock( './describe_workflow.js', () => ( {
  describeWorkflow: mockDescribeWorkflow
} ) );

vi.mock( './fetch_history_page.js', () => ( {
  fetchHistoryPage: mockFetchHistoryPage
} ) );

const { getHistory } = await import( './get_history.js' );

describe( 'getHistory', () => {
  const client = { workflow: {} };
  const connection = { workflowService: {} };

  beforeEach( () => {
    vi.clearAllMocks();
    mockFormatStatus.mockReturnValue( 'formatted-status' );
    mockDecodeEventPayloads.mockImplementation( event => ( { ...event, decoded: true } ) );
    mockSerializeEvent.mockImplementation( ( event, options ) => ( { event, options } ) );
    mockDescribeWorkflow.mockResolvedValue( {
      workflow: {
        workflowId: 'workflow-id',
        runId: 'resolved-run',
        status: 'formatted-status',
        startTime: '2024-01-01T00:00:00.000Z',
        closeTime: null,
        historyLength: 10,
        taskQueue: 'queue-a'
      }
    } );
    mockFetchHistoryPage.mockResolvedValue( { history: { events: [] } } );
  } );

  it( 'describes the workflow on the first page and returns serialized events with metadata', async () => {
    const event = { eventId: { toString: () => '1' }, eventType: 1 };
    mockFetchHistoryPage.mockResolvedValue( { history: { events: [ event ] }, nextPageToken: Buffer.from( 'next' ) } );

    const result = await getHistory( { client, connection }, 'workflow-id', { pageSize: 30 } );

    expect( mockDescribeWorkflow ).toHaveBeenCalledWith( { client }, 'workflow-id', { runId: undefined } );
    expect( mockFetchHistoryPage ).toHaveBeenCalledWith( connection, 'workflow-id', 'resolved-run', {
      maximumPageSize: 30,
      nextPageToken: undefined,
      mapInvalidArgument: expect.any( Function )
    } );
    expect( mockDecodeEventPayloads ).not.toHaveBeenCalled();
    expect( mockSerializeEvent ).toHaveBeenCalledWith( event, { includePayloads: false } );
    expect( result ).toEqual( {
      workflow: {
        workflowId: 'workflow-id',
        runId: 'resolved-run',
        status: 'formatted-status',
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
    await expect( getHistory( { client, connection }, 'workflow-id', { pageToken: 'abc' } ) ).rejects.toBeInstanceOf( InvalidPageTokenError );
    expect( mockFetchHistoryPage ).not.toHaveBeenCalled();
  } );

  it( 'skips describe for later pages and decodes pageToken from base64', async () => {
    const pageToken = Buffer.from( 'previous-token' ).toString( 'base64' );

    const result = await getHistory( { client, connection }, 'workflow-id', { runId: 'run-id', pageToken } );

    expect( mockDescribeWorkflow ).not.toHaveBeenCalled();
    expect( mockFetchHistoryPage ).toHaveBeenCalledWith( connection, 'workflow-id', 'run-id', expect.objectContaining( {
      nextPageToken: Buffer.from( pageToken, 'base64' )
    } ) );
    expect( result.workflow ).toBeNull();
    expect( result.runId ).toBe( 'run-id' );
  } );

  it( 'caps pageSize at 50 and decodes event payloads when requested', async () => {
    const rawEvent = { eventId: { toString: () => '1' }, eventType: 1 };
    const decodedEvent = { eventId: rawEvent.eventId, eventType: 1, decoded: true };
    mockDecodeEventPayloads.mockReturnValue( decodedEvent );
    mockFetchHistoryPage.mockResolvedValue( { history: { events: [ rawEvent ] } } );

    await getHistory( { client, connection }, 'workflow-id', { pageSize: 100, includePayloads: true } );

    expect( mockFetchHistoryPage ).toHaveBeenCalledWith(
      connection, 'workflow-id', 'resolved-run', expect.objectContaining( { maximumPageSize: 50 } )
    );
    expect( mockDecodeEventPayloads ).toHaveBeenCalledWith( rawEvent );
    expect( mockSerializeEvent ).toHaveBeenCalledWith( decodedEvent, { includePayloads: true } );
  } );

  it( 'propagates a NOT_FOUND error surfaced by describeWorkflow', async () => {
    const notFound = Object.assign( new Error( 'not found' ), { name: 'WorkflowNotFoundError' } );
    mockDescribeWorkflow.mockRejectedValue( notFound );

    await expect( getHistory( { client, connection }, 'workflow-id' ) ).rejects.toBe( notFound );
    expect( mockFetchHistoryPage ).not.toHaveBeenCalled();
  } );

  it( 'maps a malformed/expired pageToken (INVALID_ARGUMENT) to InvalidPageTokenError via mapInvalidArgument', async () => {
    mockFetchHistoryPage.mockImplementation( ( _connection, _workflowId, _runId, { mapInvalidArgument } ) =>
      Promise.reject( mapInvalidArgument( new Error( 'invalid' ) ) ) );

    await expect(
      getHistory( { client, connection }, 'workflow-id', { runId: 'run-id', pageToken: 'abc' } )
    ).rejects.toBeInstanceOf( InvalidPageTokenError );
  } );

  it( 'propagates other errors from fetchHistoryPage unchanged', async () => {
    const unavailable = new Error( 'unavailable' );
    mockFetchHistoryPage.mockRejectedValue( unavailable );

    await expect( getHistory( { client, connection }, 'workflow-id', { runId: 'run-id', pageToken: 'abc' } ) ).rejects.toBe( unavailable );
  } );

  it( 'suppresses pagination when Temporal returns no history field', async () => {
    mockFetchHistoryPage.mockResolvedValue( { nextPageToken: Buffer.from( 'would-loop' ) } );

    const result = await getHistory( { client, connection }, 'workflow-id' );

    expect( result.events ).toEqual( [] );
    expect( result.nextPageToken ).toBeNull();
  } );

  it( 'passes waitNewEvent and the configured deadline through when wait is requested', async () => {
    const pageToken = Buffer.from( 'previous-token' ).toString( 'base64' );

    await getHistory( { client, connection }, 'workflow-id', { runId: 'run-id', pageToken, wait: true } );

    expect( mockFetchHistoryPage ).toHaveBeenCalledWith( connection, 'workflow-id', 'run-id', {
      maximumPageSize: 20,
      nextPageToken: Buffer.from( pageToken, 'base64' ),
      mapInvalidArgument: expect.any( Function ),
      waitNewEvent: true,
      deadlineMs: 15_000
    } );
  } );

  it( 'does not pass waitNewEvent/deadlineMs when wait is not requested', async () => {
    await getHistory( { client, connection }, 'workflow-id', { pageSize: 30 } );

    expect( mockFetchHistoryPage ).toHaveBeenCalledWith( connection, 'workflow-id', 'resolved-run', {
      maximumPageSize: 30,
      nextPageToken: undefined,
      mapInvalidArgument: expect.any( Function )
    } );
  } );

  it( 'returns the unchanged cursor and empty events when a wait call times out', async () => {
    const pageToken = Buffer.from( 'previous-token' ).toString( 'base64' );
    mockFetchHistoryPage.mockResolvedValue( null );

    const result = await getHistory( { client, connection }, 'workflow-id', { runId: 'run-id', pageToken, wait: true } );

    expect( result ).toEqual( {
      workflow: null,
      events: [],
      runId: 'run-id',
      nextPageToken: pageToken
    } );
    expect( mockSerializeEvent ).not.toHaveBeenCalled();
  } );

  it( 'returns a null nextPageToken when a first-page wait call times out', async () => {
    mockFetchHistoryPage.mockResolvedValue( null );

    const result = await getHistory( { client, connection }, 'workflow-id', { wait: true } );

    expect( result.nextPageToken ).toBeNull();
    expect( result.workflow ).toEqual( expect.objectContaining( { workflowId: 'workflow-id' } ) );
  } );
} );
