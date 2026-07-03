import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockWorkflowNotFoundError, mockLoggerWarn } = vi.hoisted( () => ( {
  mockWorkflowNotFoundError: vi.fn( ( workflowId, runId ) =>
    Object.assign( new Error( `not found: ${workflowId}/${runId}` ), { name: 'WorkflowNotFoundError' } ) ),
  mockLoggerWarn: vi.fn()
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

const makeConnection = getWorkflowExecutionHistory => ( { workflowService: { getWorkflowExecutionHistory } } );

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
} );
