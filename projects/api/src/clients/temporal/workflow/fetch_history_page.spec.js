import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockWorkflowNotFoundError, mockLoggerWarn, mockIsGrpcDeadlineError } = vi.hoisted( () => ( {
  mockWorkflowNotFoundError: vi.fn( ( workflowId, runId ) =>
    Object.assign( new Error( `not found: ${workflowId}/${runId}` ), { name: 'WorkflowNotFoundError' } ) ),
  mockLoggerWarn: vi.fn(),
  mockIsGrpcDeadlineError: vi.fn( err => err?.code === 4 )
} ) );

vi.mock( '@temporalio/client', () => ( {
  isGrpcDeadlineError: mockIsGrpcDeadlineError
} ) );

vi.mock( '#configs', () => ( {
  temporal: { namespace: 'default' }
} ) );

vi.mock( '#logger', () => ( {
  logger: { warn: mockLoggerWarn }
} ) );

vi.mock( '../../errors.js', () => ( {
  workflowNotFoundError: mockWorkflowNotFoundError
} ) );

const { fetchHistoryPage } = await import( './fetch_history_page.js' );

const makeConnection = ( getWorkflowExecutionHistory, withDeadline ) => ( {
  workflowService: { getWorkflowExecutionHistory },
  withDeadline: withDeadline ?? vi.fn( ( _deadline, fn ) => fn() )
} );

describe( 'fetchHistoryPage', () => {
  beforeEach( () => vi.clearAllMocks() );

  it( 'requests the page with namespace, execution, and paging options', async () => {
    const getWorkflowExecutionHistory = vi.fn().mockResolvedValue( { history: { events: [] } } );

    await fetchHistoryPage( makeConnection( getWorkflowExecutionHistory ), 'wf-1', 'run-1', {
      maximumPageSize: 10,
      nextPageToken: Buffer.from( 'token' )
    } );

    expect( getWorkflowExecutionHistory ).toHaveBeenCalledWith( {
      namespace: 'default',
      execution: { workflowId: 'wf-1', runId: 'run-1' },
      maximumPageSize: 10,
      nextPageToken: Buffer.from( 'token' )
    } );
  } );

  it( 'returns the raw response on success', async () => {
    const response = { history: { events: [ { eventId: 1 } ] }, nextPageToken: Buffer.from( 'next' ) };
    const getWorkflowExecutionHistory = vi.fn().mockResolvedValue( response );

    const result = await fetchHistoryPage( makeConnection( getWorkflowExecutionHistory ), 'wf-1', 'run-1' );

    expect( result ).toBe( response );
  } );

  it( 'maps NOT_FOUND to a run-aware WorkflowNotFoundError', async () => {
    const notFound = Object.assign( new Error( 'missing' ), { code: 5 } );
    const getWorkflowExecutionHistory = vi.fn().mockRejectedValue( notFound );

    await expect( fetchHistoryPage( makeConnection( getWorkflowExecutionHistory ), 'wf-1', 'run-1' ) )
      .rejects.toMatchObject( { name: 'WorkflowNotFoundError' } );
    expect( mockWorkflowNotFoundError ).toHaveBeenCalledWith( 'wf-1', 'run-1' );
  } );

  it( 'maps INVALID_ARGUMENT through the caller-supplied mapper when provided', async () => {
    const invalidArgument = Object.assign( new Error( 'invalid' ), { code: 3 } );
    const getWorkflowExecutionHistory = vi.fn().mockRejectedValue( invalidArgument );
    const mapInvalidArgument = vi.fn().mockReturnValue( new Error( 'mapped' ) );

    await expect( fetchHistoryPage( makeConnection( getWorkflowExecutionHistory ), 'wf-1', 'run-1', { mapInvalidArgument } ) )
      .rejects.toThrow( 'mapped' );
    expect( mapInvalidArgument ).toHaveBeenCalledWith( invalidArgument );
  } );

  it( 'propagates INVALID_ARGUMENT unmapped when no mapper is supplied', async () => {
    const invalidArgument = Object.assign( new Error( 'invalid' ), { code: 3 } );
    const getWorkflowExecutionHistory = vi.fn().mockRejectedValue( invalidArgument );

    await expect( fetchHistoryPage( makeConnection( getWorkflowExecutionHistory ), 'wf-1', 'run-1' ) )
      .rejects.toBe( invalidArgument );
  } );

  it( 'propagates other errors unchanged', async () => {
    const unavailable = Object.assign( new Error( 'unavailable' ), { code: 14 } );
    const getWorkflowExecutionHistory = vi.fn().mockRejectedValue( unavailable );

    await expect( fetchHistoryPage( makeConnection( getWorkflowExecutionHistory ), 'wf-1', 'run-1' ) )
      .rejects.toBe( unavailable );
  } );

  it( 'throws a clear error if the RPC rejects without an error object', async () => {
    const getWorkflowExecutionHistory = vi.fn().mockRejectedValue( null );

    await expect( fetchHistoryPage( makeConnection( getWorkflowExecutionHistory ), 'wf-1', 'run-1' ) )
      .rejects.toThrow( 'Temporal getWorkflowExecutionHistory rejected with no error' );
  } );

  it( 'warns once when Temporal returns no history field', async () => {
    const getWorkflowExecutionHistory = vi.fn().mockResolvedValue( { nextPageToken: Buffer.from( 'would-loop' ) } );

    await fetchHistoryPage( makeConnection( getWorkflowExecutionHistory ), 'wf-1', 'run-1' );

    expect( mockLoggerWarn ).toHaveBeenCalledWith(
      'Temporal getWorkflowExecutionHistory returned no history field',
      { workflowId: 'wf-1', runId: 'run-1' }
    );
  } );

  it( 'does not warn when the history field is present', async () => {
    const getWorkflowExecutionHistory = vi.fn().mockResolvedValue( { history: {} } );

    await fetchHistoryPage( makeConnection( getWorkflowExecutionHistory ), 'wf-1', 'run-1' );

    expect( mockLoggerWarn ).not.toHaveBeenCalled();
  } );

  it( 'passes waitNewEvent and applies a deadline when requested', async () => {
    const response = { history: { events: [] } };
    const getWorkflowExecutionHistory = vi.fn().mockResolvedValue( response );
    const withDeadline = vi.fn( ( _deadline, fn ) => fn() );

    const result = await fetchHistoryPage(
      makeConnection( getWorkflowExecutionHistory, withDeadline ), 'wf-1', 'run-1',
      { maximumPageSize: 10, waitNewEvent: true, deadlineMs: 15_000 }
    );

    expect( withDeadline ).toHaveBeenCalledWith( expect.any( Number ), expect.any( Function ) );
    expect( getWorkflowExecutionHistory ).toHaveBeenCalledWith( {
      namespace: 'default',
      execution: { workflowId: 'wf-1', runId: 'run-1' },
      maximumPageSize: 10,
      nextPageToken: undefined,
      waitNewEvent: true
    } );
    expect( result ).toBe( response );
  } );

  it( 'does not apply a deadline or waitNewEvent when not requested', async () => {
    const getWorkflowExecutionHistory = vi.fn().mockResolvedValue( { history: { events: [] } } );
    const withDeadline = vi.fn( ( _deadline, fn ) => fn() );

    await fetchHistoryPage( makeConnection( getWorkflowExecutionHistory, withDeadline ), 'wf-1', 'run-1' );

    expect( withDeadline ).not.toHaveBeenCalled();
    expect( getWorkflowExecutionHistory ).toHaveBeenCalledWith( {
      namespace: 'default',
      execution: { workflowId: 'wf-1', runId: 'run-1' },
      maximumPageSize: undefined,
      nextPageToken: undefined
    } );
  } );

  it( 'returns null when a waitNewEvent call hits its deadline with no new events', async () => {
    const deadlineError = Object.assign( new Error( 'deadline exceeded' ), { code: 4 } );
    const getWorkflowExecutionHistory = vi.fn().mockRejectedValue( deadlineError );

    const result = await fetchHistoryPage(
      makeConnection( getWorkflowExecutionHistory ), 'wf-1', 'run-1',
      { waitNewEvent: true, deadlineMs: 15_000 }
    );

    expect( result ).toBeNull();
  } );

  it( 'propagates a deadline error unchanged when waitNewEvent was not requested', async () => {
    const deadlineError = Object.assign( new Error( 'deadline exceeded' ), { code: 4 } );
    const getWorkflowExecutionHistory = vi.fn().mockRejectedValue( deadlineError );

    await expect( fetchHistoryPage( makeConnection( getWorkflowExecutionHistory ), 'wf-1', 'run-1' ) )
      .rejects.toBe( deadlineError );
  } );
} );
