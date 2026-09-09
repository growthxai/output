import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLoggerWarn } = vi.hoisted( () => ( { mockLoggerWarn: vi.fn() } ) );

vi.mock( '#logger', () => ( { logger: { warn: mockLoggerWarn } } ) );

const unmappedSearchAttributeError = () => {
  const cause = Object.assign( new Error( '3 INVALID_ARGUMENT: Namespace default has no mapping defined for search attribute WorkspaceId' ), {
    code: 3,
    details: 'Namespace default has no mapping defined for search attribute WorkspaceId',
    metadata: {}
  } );
  return Object.assign( new Error( 'Failed to start Workflow' ), { cause } );
};

describe( 'startWorkflowExecution', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'starts without searchAttributes when the input has no workspaceId', async () => {
    const start = vi.fn().mockResolvedValue( { firstExecutionRunId: 'run-1' } );
    const client = { workflow: { start } };
    const { startWorkflowExecution } = await import( './start_workflow_execution.js' );

    await startWorkflowExecution( client, 'resolved-workflow', { value: 1 }, { args: [ { value: 1 } ] } );

    expect( start ).toHaveBeenCalledTimes( 1 );
    expect( start ).toHaveBeenCalledWith( 'resolved-workflow', { args: [ { value: 1 } ] } );
  } );

  it( 'starts with a WorkspaceId searchAttribute when the input has a workspaceId', async () => {
    const start = vi.fn().mockResolvedValue( { firstExecutionRunId: 'run-1' } );
    const client = { workflow: { start } };
    const { startWorkflowExecution } = await import( './start_workflow_execution.js' );

    await startWorkflowExecution( client, 'resolved-workflow', { workspaceId: 'ws-1' }, { args: [ { workspaceId: 'ws-1' } ] } );

    expect( start ).toHaveBeenCalledTimes( 1 );
    expect( start ).toHaveBeenCalledWith( 'resolved-workflow', {
      args: [ { workspaceId: 'ws-1' } ],
      searchAttributes: { WorkspaceId: [ 'ws-1' ] }
    } );
  } );

  it( 'retries without searchAttributes when Temporal reports the attribute is unmapped', async () => {
    const handle = { firstExecutionRunId: 'run-1' };
    const start = vi.fn()
      .mockRejectedValueOnce( unmappedSearchAttributeError() )
      .mockResolvedValueOnce( handle );
    const client = { workflow: { start } };
    const { startWorkflowExecution } = await import( './start_workflow_execution.js' );

    const result = await startWorkflowExecution( client, 'resolved-workflow', { workspaceId: 'ws-1' }, { args: [ {} ] } );

    expect( result ).toBe( handle );
    expect( start ).toHaveBeenCalledTimes( 2 );
    expect( start ).toHaveBeenNthCalledWith( 1, 'resolved-workflow', {
      args: [ {} ],
      searchAttributes: { WorkspaceId: [ 'ws-1' ] }
    } );
    expect( start ).toHaveBeenNthCalledWith( 2, 'resolved-workflow', { args: [ {} ] } );
    expect( mockLoggerWarn ).toHaveBeenCalledWith(
      expect.stringContaining( 'not registered on namespace' ),
      expect.objectContaining( { workflowName: 'resolved-workflow' } )
    );
  } );

  it( 'propagates unrelated errors without retrying', async () => {
    const error = new Error( 'connection lost' );
    const start = vi.fn().mockRejectedValue( error );
    const client = { workflow: { start } };
    const { startWorkflowExecution } = await import( './start_workflow_execution.js' );

    await expect(
      startWorkflowExecution( client, 'resolved-workflow', { workspaceId: 'ws-1' }, { args: [ {} ] } )
    ).rejects.toBe( error );
    expect( start ).toHaveBeenCalledTimes( 1 );
    expect( mockLoggerWarn ).not.toHaveBeenCalled();
  } );

  it( 'propagates other INVALID_ARGUMENT errors without retrying', async () => {
    const cause = Object.assign( new Error( '3 INVALID_ARGUMENT: bad request' ), {
      code: 3,
      details: 'bad request',
      metadata: {}
    } );
    const error = Object.assign( new Error( 'Failed to start Workflow' ), { cause } );
    const start = vi.fn().mockRejectedValue( error );
    const client = { workflow: { start } };
    const { startWorkflowExecution } = await import( './start_workflow_execution.js' );

    await expect(
      startWorkflowExecution( client, 'resolved-workflow', { workspaceId: 'ws-1' }, { args: [ {} ] } )
    ).rejects.toBe( error );
    expect( start ).toHaveBeenCalledTimes( 1 );
    expect( mockLoggerWarn ).not.toHaveBeenCalled();
  } );
} );
