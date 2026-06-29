import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDescribeWorkflow, mockExtractWorkflowInput, mockWorkflowNotFoundError } = vi.hoisted( () => ( {
  mockDescribeWorkflow: vi.fn(),
  mockExtractWorkflowInput: vi.fn(),
  mockWorkflowNotFoundError: vi.fn( ( workflowId, runId ) =>
    Object.assign( new Error( `not found: ${workflowId}/${runId}` ), { name: 'WorkflowNotFoundError' } ) )
} ) );

vi.mock( '#configs', () => ( {
  temporal: { namespace: 'default' }
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

  const makeFixtures = ( { getHistoryError } = {} ) => {
    const getWorkflowExecutionHistory = vi.fn();
    if ( getHistoryError !== undefined ) {
      getWorkflowExecutionHistory.mockRejectedValue( getHistoryError );
    } else {
      // History content is irrelevant: extractWorkflowInput is mocked, so getInput's
      // return comes from the mock, not from decoding this object.
      getWorkflowExecutionHistory.mockResolvedValue( { history: {} } );
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
    expect( result ).toEqual( { workflowId: 'workflow-id', runId: 'resolved-run', input: { values: [ 1, 2, 3 ] } } );
  } );

  it( 'skips describe and targets the pinned run when a runId is given', async () => {
    const fixtures = makeFixtures();
    const { getInput } = await import( './get_input.js' );

    await getInput( fixtures, 'workflow-id', 'pinned-run' );

    expect( mockDescribeWorkflow ).not.toHaveBeenCalled();
    expect( fixtures.getWorkflowExecutionHistory ).toHaveBeenCalledWith(
      expect.objectContaining( { execution: { workflowId: 'workflow-id', runId: 'pinned-run' } } )
    );
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
