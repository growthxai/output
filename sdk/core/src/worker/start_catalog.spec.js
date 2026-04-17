import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
vi.mock( '#logger', () => ( { createChildLogger: () => mockLog } ) );

vi.mock( '#consts', () => ( { WORKFLOW_CATALOG: 'catalog' } ) );

const catalogId = 'test-catalog';
const taskQueue = 'test-queue';
vi.mock( './configs.js', () => ( { catalogId, taskQueue } ) );

const workflowStartMock = vi.fn().mockResolvedValue( undefined );
vi.mock( '@temporalio/client', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    Client: vi.fn().mockImplementation( function () {
      return { workflow: { start: workflowStartMock } };
    } )
  };
} );

vi.mock( '@temporalio/common', () => ( { WorkflowIdConflictPolicy: { TERMINATE_EXISTING: 'TERMINATE_EXISTING' } } ) );

describe( 'worker/start_catalog', () => {
  const mockConnection = {};
  const namespace = 'default';
  const catalog = { workflows: [], activities: {} };

  beforeEach( () => {
    vi.clearAllMocks();
    workflowStartMock.mockResolvedValue( undefined );
  } );

  it( 'starts catalog workflow with TERMINATE_EXISTING policy', async () => {
    const { startCatalog } = await import( './start_catalog.js' );
    await startCatalog( { connection: mockConnection, namespace, catalog } );

    expect( mockLog.info ).toHaveBeenCalledWith( 'Starting catalog workflow...' );
    expect( workflowStartMock ).toHaveBeenCalledWith( 'catalog', {
      taskQueue,
      workflowId: catalogId,
      workflowIdConflictPolicy: 'TERMINATE_EXISTING',
      args: [ catalog ]
    } );
  } );

  it( 'propagates errors from workflow.start', async () => {
    workflowStartMock.mockRejectedValue( new Error( 'Connection refused' ) );

    const { startCatalog } = await import( './start_catalog.js' );
    await expect( startCatalog( { connection: mockConnection, namespace, catalog } ) )
      .rejects.toThrow( 'Connection refused' );
  } );
} );
