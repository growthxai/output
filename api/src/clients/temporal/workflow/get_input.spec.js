import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowMissingRunIdError } from '../../errors.js';

const { mockDescribeWorkflow, mockExtractWorkflowInput, mockFetchHistoryPage } = vi.hoisted( () => ( {
  mockDescribeWorkflow: vi.fn(),
  mockExtractWorkflowInput: vi.fn(),
  mockFetchHistoryPage: vi.fn()
} ) );

vi.mock( './describe_workflow.js', () => ( {
  describeWorkflow: mockDescribeWorkflow
} ) );

vi.mock( './get_result.js', () => ( {
  extractWorkflowInput: mockExtractWorkflowInput
} ) );

vi.mock( './fetch_history_page.js', () => ( {
  fetchHistoryPage: mockFetchHistoryPage
} ) );

const { getInput } = await import( './get_input.js' );

describe( 'getInput', () => {
  const fixtures = { client: { workflow: {} }, connection: { workflowService: {} } };

  beforeEach( () => {
    vi.clearAllMocks();
    mockDescribeWorkflow.mockResolvedValue( { description: { runId: 'resolved-run' } } );
    mockExtractWorkflowInput.mockReturnValue( { values: [ 1, 2, 3 ] } );
    // History content is irrelevant: extractWorkflowInput is mocked, so getInput's return
    // comes from the mock, not from decoding this object.
    mockFetchHistoryPage.mockResolvedValue( { history: {} } );
  } );

  it( 'resolves the latest run via describe and returns the decoded input', async () => {
    const result = await getInput( fixtures, 'workflow-id' );

    expect( mockDescribeWorkflow ).toHaveBeenCalledWith( { client: fixtures.client }, 'workflow-id' );
    expect( mockFetchHistoryPage ).toHaveBeenCalledWith( fixtures.connection, 'workflow-id', 'resolved-run', {
      maximumPageSize: 1,
      mapInvalidArgument: expect.any( Function )
    } );
    // Pin the wiring: the resolved history object is what gets decoded, not the whole page.
    expect( mockExtractWorkflowInput ).toHaveBeenCalledWith( {} );
    expect( result ).toEqual( { workflowId: 'workflow-id', runId: 'resolved-run', input: { values: [ 1, 2, 3 ] } } );
  } );

  it( 'throws when describe reports no runId rather than reading the unpinned latest run', async () => {
    mockDescribeWorkflow.mockResolvedValue( { description: {} } );

    await expect( getInput( fixtures, 'workflow-id' ) ).rejects.toBeInstanceOf( WorkflowMissingRunIdError );
    expect( mockFetchHistoryPage ).not.toHaveBeenCalled();
  } );

  it( 'reads a pinned run directly without describing it', async () => {
    const result = await getInput( fixtures, 'workflow-id', 'pinned-run' );

    // A pinned run is already known, so describe is skipped to save a round-trip.
    expect( mockDescribeWorkflow ).not.toHaveBeenCalled();
    expect( mockFetchHistoryPage ).toHaveBeenCalledWith(
      fixtures.connection, 'workflow-id', 'pinned-run', expect.objectContaining( { maximumPageSize: 1 } )
    );
    expect( result ).toEqual( { workflowId: 'workflow-id', runId: 'pinned-run', input: { values: [ 1, 2, 3 ] } } );
  } );

  it( 'wires mapInvalidArgument to translate a malformed/expired pinned run into a WorkflowNotFoundError', async () => {
    mockFetchHistoryPage.mockImplementation( ( _connection, _workflowId, _runId, { mapInvalidArgument } ) =>
      Promise.reject( mapInvalidArgument( new Error( 'invalid runId' ) ) ) );

    await expect( getInput( fixtures, 'workflow-id', 'pinned-run' ) ).rejects.toMatchObject( { name: 'WorkflowNotFoundError' } );
  } );

  it( 'follows firstExecutionRunId back to the original run for a continue-as-new chain', async () => {
    mockFetchHistoryPage
      .mockResolvedValueOnce( { history: { events: [ { workflowExecutionStartedEventAttributes: { firstExecutionRunId: 'first-run' } } ] } } )
      .mockResolvedValueOnce( { history: {} } );
    mockExtractWorkflowInput.mockReturnValue( { values: [ 9 ] } );

    const result = await getInput( fixtures, 'workflow-id' );

    // Latest run resolved to 'resolved-run', but its start event points at 'first-run', so the
    // original input is re-fetched from the chain's first run.
    expect( mockFetchHistoryPage ).toHaveBeenNthCalledWith(
      2, fixtures.connection, 'workflow-id', 'first-run', { maximumPageSize: 1 }
    );
    expect( result ).toEqual( { workflowId: 'workflow-id', runId: 'first-run', input: { values: [ 9 ] } } );
  } );

  it( 'does not follow firstExecutionRunId when the caller pinned a runId', async () => {
    mockFetchHistoryPage.mockResolvedValue( {
      history: { events: [ { workflowExecutionStartedEventAttributes: { firstExecutionRunId: 'first-run' } } ] }
    } );

    const result = await getInput( fixtures, 'workflow-id', 'pinned-run' );

    expect( mockFetchHistoryPage ).toHaveBeenCalledTimes( 1 );
    expect( result.runId ).toBe( 'pinned-run' );
  } );

  it( 'returns null input when no payloads exist (e.g. a running workflow with empty start input)', async () => {
    mockExtractWorkflowInput.mockReturnValue( null );

    const result = await getInput( fixtures, 'workflow-id' );

    expect( result ).toEqual( { workflowId: 'workflow-id', runId: 'resolved-run', input: null } );
  } );

  it( 'propagates errors from fetchHistoryPage unchanged', async () => {
    const unavailable = new Error( 'unavailable' );
    mockFetchHistoryPage.mockRejectedValue( unavailable );

    await expect( getInput( fixtures, 'workflow-id' ) ).rejects.toBe( unavailable );
  } );
} );
