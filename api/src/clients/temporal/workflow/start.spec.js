import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockBuildWorkflowId, mockGetCatalog, mockResolveWorkflowName } = vi.hoisted( () => ( {
  mockBuildWorkflowId: vi.fn(),
  mockGetCatalog: vi.fn(),
  mockResolveWorkflowName: vi.fn()
} ) );

vi.mock( '#configs', () => ( {
  temporal: {
    defaultTaskQueue: 'default-queue',
    workflowExecutionTimeout: 60_000
  }
} ) );

vi.mock( '#utils', () => ( {
  buildWorkflowId: mockBuildWorkflowId
} ) );

vi.mock( '../catalog.js', () => ( {
  getCatalog: mockGetCatalog,
  resolveWorkflowName: mockResolveWorkflowName
} ) );

describe( 'start', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    mockBuildWorkflowId.mockReturnValue( 'generated-id' );
    mockGetCatalog.mockResolvedValue( { workflows: [] } );
    mockResolveWorkflowName.mockReturnValue( 'resolved-workflow' );
  } );

  it( 'resolves the workflow against the default task queue and starts it with a generated workflow id', async () => {
    const temporalStart = vi.fn().mockResolvedValue( { firstExecutionRunId: 'run-1' } );
    const client = { workflow: { start: temporalStart } };
    const { start } = await import( './start.js' );

    const result = await start( { client }, 'alias-name', { value: 1 } );

    expect( mockGetCatalog ).toHaveBeenCalledWith( { client, taskQueue: 'default-queue' } );
    expect( mockResolveWorkflowName ).toHaveBeenCalledWith( { workflows: [] }, 'alias-name', 'default-queue' );
    expect( temporalStart ).toHaveBeenCalledWith( 'resolved-workflow', {
      args: [ { value: 1 } ],
      taskQueue: 'default-queue',
      workflowId: 'generated-id',
      workflowExecutionTimeout: 60_000
    } );
    expect( result ).toEqual( { workflowId: 'generated-id', runId: 'run-1' } );
  } );

  it( 'uses caller-provided workflow id and task queue', async () => {
    const temporalStart = vi.fn().mockResolvedValue( {} );
    const client = { workflow: { start: temporalStart } };
    const { start } = await import( './start.js' );

    const result = await start( { client }, 'workflow', null, { workflowId: 'provided-id', taskQueue: 'custom-queue' } );

    expect( mockBuildWorkflowId ).not.toHaveBeenCalled();
    expect( mockGetCatalog ).toHaveBeenCalledWith( { client, taskQueue: 'custom-queue' } );
    expect( temporalStart ).toHaveBeenCalledWith( 'resolved-workflow', expect.objectContaining( {
      workflowId: 'provided-id',
      taskQueue: 'custom-queue'
    } ) );
    expect( result ).toEqual( { workflowId: 'provided-id', runId: null } );
  } );

  it( 'propagates catalog resolution errors before starting', async () => {
    const error = new Error( 'catalog unavailable' );
    const temporalStart = vi.fn();
    const client = { workflow: { start: temporalStart } };
    mockGetCatalog.mockRejectedValue( error );
    const { start } = await import( './start.js' );

    await expect( start( { client }, 'workflow', {} ) ).rejects.toBe( error );
    expect( temporalStart ).not.toHaveBeenCalled();
  } );
} );
