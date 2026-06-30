import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDescribeWorkflow, mockExtractWorkflowInput, mockWorkflowNotFoundError, mockLoggerWarn } = vi.hoisted( () => ( {
  mockDescribeWorkflow: vi.fn(),
  mockExtractWorkflowInput: vi.fn(),
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

vi.mock( './describe_workflow.js', () => ( {
  describeWorkflow: mockDescribeWorkflow
} ) );

vi.mock( './get_result.js', () => ( {
  extractWorkflowInput: mockExtractWorkflowInput
} ) );

describe( 'getInput', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    mockDescribeWorkflow.mockResolvedValue( { description: { runId: 'resolved-run' } } );
    mockExtractWorkflowInput.mockReturnValue( { values: [ 1, 2, 3 ] } );
  } );

  const makeFixtures = ( { historyResponse, getHistoryError } = {} ) => {
    const getWorkflowExecutionHistory = vi.fn();
    if ( getHistoryError !== undefined ) {
      getWorkflowExecutionHistory.mockRejectedValue( getHistoryError );
    } else {
      // History content is irrelevant: extractWorkflowInput is mocked, so getInput's
      // return comes from the mock, not from decoding this object.
      getWorkflowExecutionHistory.mockResolvedValue( historyResponse ?? { history: {} } );
    }
    return {
      getWorkflowExecutionHistory,
      client: { workflow: {} },
      connection: { workflowService: { getWorkflowExecutionHistory } }
    };
  };

  it( 'resolves the latest run via describe and returns the decoded input', async () => {
    const fixtures = makeFixtures();
    const { getInput } = await import( './get_input.js' );

    const result = await getInput( fixtures, 'workflow-id' );

    expect( mockDescribeWorkflow ).toHaveBeenCalledWith( { client: fixtures.client }, 'workflow-id' );
    expect( fixtures.getWorkflowExecutionHistory ).toHaveBeenCalledWith( {
      namespace: 'default',
      execution: { workflowId: 'workflow-id', runId: 'resolved-run' },
      maximumPageSize: 1
    } );
    // Pin the wiring: the resolved history object is what gets decoded, not the whole page.
    expect( mockExtractWorkflowInput ).toHaveBeenCalledWith( {} );
    expect( result ).toEqual( { workflowId: 'workflow-id', runId: 'resolved-run', input: { values: [ 1, 2, 3 ] } } );
  } );

  it( 'throws when describe reports no runId rather than reading the unpinned latest run', async () => {
    mockDescribeWorkflow.mockResolvedValue( { description: {} } );
    const fixtures = makeFixtures();
    const { getInput } = await import( './get_input.js' );

    await expect( getInput( fixtures, 'workflow-id' ) ).rejects.toThrow( /did not report a runId/ );
    expect( fixtures.getWorkflowExecutionHistory ).not.toHaveBeenCalled();
  } );

  it( 'warns when the history response has no history field', async () => {
    const fixtures = makeFixtures( { historyResponse: {} } );
    const { getInput } = await import( './get_input.js' );

    await getInput( fixtures, 'workflow-id' );

    expect( mockLoggerWarn ).toHaveBeenCalledWith(
      'Temporal getWorkflowExecutionHistory returned no history field',
      { workflowId: 'workflow-id', runId: 'resolved-run' }
    );
  } );

  it( 'reads a pinned run directly without describing it', async () => {
    const fixtures = makeFixtures();
    const { getInput } = await import( './get_input.js' );

    const result = await getInput( fixtures, 'workflow-id', 'pinned-run' );

    // A pinned run is already known, so describe is skipped to save a round-trip.
    expect( mockDescribeWorkflow ).not.toHaveBeenCalled();
    expect( fixtures.getWorkflowExecutionHistory ).toHaveBeenCalledWith(
      expect.objectContaining( { execution: { workflowId: 'workflow-id', runId: 'pinned-run' } } )
    );
    expect( result ).toEqual( { workflowId: 'workflow-id', runId: 'pinned-run', input: { values: [ 1, 2, 3 ] } } );
  } );

  it( 'maps a malformed/expired pinned run (INVALID_ARGUMENT) to a 404 without describing', async () => {
    const invalidArg = Object.assign( new Error( 'invalid runId' ), { code: 3 } );
    const fixtures = makeFixtures( { getHistoryError: invalidArg } );
    const { getInput } = await import( './get_input.js' );

    await expect( getInput( fixtures, 'workflow-id', 'pinned-run' ) ).rejects.toMatchObject( { name: 'WorkflowNotFoundError' } );
    expect( mockDescribeWorkflow ).not.toHaveBeenCalled();
  } );

  it( 'follows firstExecutionRunId back to the original run for a continue-as-new chain', async () => {
    const getWorkflowExecutionHistory = vi.fn()
      .mockResolvedValueOnce( { history: { events: [ { workflowExecutionStartedEventAttributes: { firstExecutionRunId: 'first-run' } } ] } } )
      .mockResolvedValueOnce( { history: {} } );
    const fixtures = {
      getWorkflowExecutionHistory,
      client: { workflow: {} },
      connection: { workflowService: { getWorkflowExecutionHistory } }
    };
    mockExtractWorkflowInput.mockReturnValue( { values: [ 9 ] } );
    const { getInput } = await import( './get_input.js' );

    const result = await getInput( fixtures, 'workflow-id' );

    // Latest run resolved to 'resolved-run', but its start event points at 'first-run', so the
    // original input is re-fetched from the chain's first run.
    expect( getWorkflowExecutionHistory ).toHaveBeenNthCalledWith(
      2, expect.objectContaining( { execution: { workflowId: 'workflow-id', runId: 'first-run' } } )
    );
    expect( result ).toEqual( { workflowId: 'workflow-id', runId: 'first-run', input: { values: [ 9 ] } } );
  } );

  it( 'returns null input when no payloads exist (e.g. a running workflow with empty start input)', async () => {
    mockExtractWorkflowInput.mockReturnValue( null );
    const fixtures = makeFixtures();
    const { getInput } = await import( './get_input.js' );

    const result = await getInput( fixtures, 'workflow-id' );

    expect( result ).toEqual( { workflowId: 'workflow-id', runId: 'resolved-run', input: null } );
  } );

  it( 'maps NOT_FOUND history errors to WorkflowNotFoundError and propagates other errors', async () => {
    const notFound = Object.assign( new Error( 'missing' ), { code: 5 } );
    const unavailable = Object.assign( new Error( 'unavailable' ), { code: 14 } );
    const { getInput } = await import( './get_input.js' );

    await expect( getInput( makeFixtures( { getHistoryError: notFound } ), 'workflow-id' ) )
      .rejects.toMatchObject( { name: 'WorkflowNotFoundError' } );
    await expect( getInput( makeFixtures( { getHistoryError: unavailable } ), 'workflow-id' ) )
      .rejects.toBe( unavailable );
  } );
} );
