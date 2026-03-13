import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowNotFoundError } from '@temporalio/client';

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
vi.mock( '#logger', () => ( { createChildLogger: () => mockLog } ) );

vi.mock( '#consts', () => ( { WORKFLOW_CATALOG: 'catalog' } ) );

const catalogId = 'test-catalog';
const taskQueue = 'test-queue';
vi.mock( './configs.js', () => ( { catalogId, taskQueue } ) );

const describeMock = vi.fn();
const executeUpdateMock = vi.fn();
const workflowStartMock = vi.fn().mockResolvedValue( undefined );
vi.mock( '@temporalio/client', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    Client: vi.fn().mockImplementation( function () {
      return {
        workflow: {
          start: workflowStartMock,
          getHandle: () => ( { describe: describeMock, executeUpdate: executeUpdateMock } )
        }
      };
    } )
  };
} );

vi.mock( '@temporalio/common', () => ( { WorkflowIdConflictPolicy: { FAIL: 'FAIL' } } ) );

describe( 'worker/start_catalog', () => {
  const mockConnection = {};
  const namespace = 'default';
  const catalog = { workflows: [], activities: {} };

  beforeEach( () => {
    vi.clearAllMocks();
    workflowStartMock.mockResolvedValue( undefined );
  } );

  it( 'when previous catalog still running: completes it then starts catalog workflow', async () => {
    describeMock.mockResolvedValue( { closeTime: undefined } );
    executeUpdateMock.mockResolvedValue( undefined );

    const { startCatalog } = await import( './start_catalog.js' );
    await startCatalog( { connection: mockConnection, namespace, catalog } );

    expect( describeMock ).toHaveBeenCalled();
    expect( mockLog.info ).toHaveBeenCalledWith( 'Completing previous catalog workflow...' );
    expect( executeUpdateMock ).toHaveBeenCalledWith( 'complete', { args: [] } );
    expect( mockLog.info ).toHaveBeenCalledWith( 'Starting catalog workflow...' );
    expect( workflowStartMock ).toHaveBeenCalledWith( 'catalog', {
      taskQueue,
      workflowId: catalogId,
      workflowIdConflictPolicy: 'FAIL',
      args: [ catalog ]
    } );
  } );

  it( 'when no previous catalog: ignores and starts catalog workflow', async () => {
    describeMock.mockRejectedValue( new WorkflowNotFoundError( 'not found' ) );

    const { startCatalog } = await import( './start_catalog.js' );
    await startCatalog( { connection: mockConnection, namespace, catalog } );

    expect( describeMock ).toHaveBeenCalled();
    expect( mockLog.warn ).not.toHaveBeenCalled();
    expect( mockLog.info ).toHaveBeenCalledWith( 'Starting catalog workflow...' );
    expect( executeUpdateMock ).not.toHaveBeenCalled();
    expect( workflowStartMock ).toHaveBeenCalledWith( 'catalog', {
      taskQueue,
      workflowId: catalogId,
      workflowIdConflictPolicy: 'FAIL',
      args: [ catalog ]
    } );
  } );

  it( 'when previous catalog already closed: skips complete and starts catalog workflow', async () => {
    describeMock.mockResolvedValue( { closeTime: '2024-01-01T00:00:00Z' } );

    const { startCatalog } = await import( './start_catalog.js' );
    await startCatalog( { connection: mockConnection, namespace, catalog } );

    expect( describeMock ).toHaveBeenCalled();
    expect( mockLog.info ).not.toHaveBeenCalledWith( 'Completing previous catalog workflow...' );
    expect( executeUpdateMock ).not.toHaveBeenCalled();
    expect( mockLog.info ).toHaveBeenCalledWith( 'Starting catalog workflow...' );
    expect( workflowStartMock ).toHaveBeenCalledWith( 'catalog', {
      taskQueue,
      workflowId: catalogId,
      workflowIdConflictPolicy: 'FAIL',
      args: [ catalog ]
    } );
  } );

  it( 'when describe or complete fails with other error: logs warn and still starts catalog workflow', async () => {
    describeMock.mockResolvedValue( { closeTime: undefined } );
    executeUpdateMock.mockRejectedValue( new Error( 'Connection refused' ) );

    const { startCatalog } = await import( './start_catalog.js' );
    await startCatalog( { connection: mockConnection, namespace, catalog } );

    expect( describeMock ).toHaveBeenCalled();
    expect( executeUpdateMock ).toHaveBeenCalledWith( 'complete', { args: [] } );
    expect( mockLog.warn ).toHaveBeenCalledWith( 'Error interacting with previous catalog workflow', {
      error: expect.any( Error )
    } );
    expect( mockLog.info ).toHaveBeenCalledWith( 'Starting catalog workflow...' );
    expect( workflowStartMock ).toHaveBeenCalledWith( 'catalog', {
      taskQueue,
      workflowId: catalogId,
      workflowIdConflictPolicy: 'FAIL',
      args: [ catalog ]
    } );
  } );
} );
