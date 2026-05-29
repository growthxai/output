import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowNotFoundError } from '@temporalio/client';
import { WorkflowExecutionAlreadyStartedError } from '@temporalio/common';

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
vi.mock( '#logger', () => ( { createChildLogger: () => mockLog } ) );

vi.mock( '#consts', () => ( { WORKFLOW_CATALOG: 'catalog' } ) );

const catalogId = 'test-catalog';
const taskQueue = 'test-queue';
vi.mock( './configs.js', () => ( { catalogId, taskQueue } ) );

const describeMock = vi.fn();
const queryMock = vi.fn();
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
          getHandle: () => ( { describe: describeMock, query: queryMock, executeUpdate: executeUpdateMock } )
        }
      };
    } )
  };
} );

describe( 'worker/start_catalog', () => {
  const mockConnection = {};
  const namespace = 'default';
  const catalog = { workflows: [], activities: {} };
  const catalogHash = 'catalog-hash';

  beforeEach( () => {
    mockLog.info.mockClear();
    mockLog.warn.mockClear();
    mockLog.error.mockClear();
    describeMock.mockReset();
    queryMock.mockReset();
    executeUpdateMock.mockReset();
    workflowStartMock.mockReset();
    workflowStartMock.mockResolvedValue( undefined );
  } );

  it( 'when previous catalog still running with different hash: completes it then starts catalog workflow', async () => {
    describeMock.mockResolvedValue( { closeTime: undefined } );
    queryMock.mockResolvedValue( 'old-catalog-hash' );
    executeUpdateMock.mockResolvedValue( undefined );

    const { startCatalog } = await import( './start_catalog.js' );
    await startCatalog( { connection: mockConnection, namespace, catalog, catalogHash } );

    expect( describeMock ).toHaveBeenCalled();
    expect( queryMock ).toHaveBeenCalledWith( 'get_hash' );
    expect( mockLog.info ).toHaveBeenCalledWith( 'Completing previous catalog workflow...' );
    expect( executeUpdateMock ).toHaveBeenCalledWith( 'complete', { args: [] } );
    expect( mockLog.info ).toHaveBeenCalledWith( 'Starting catalog workflow...' );
    expect( workflowStartMock ).toHaveBeenCalledWith( 'catalog', {
      taskQueue,
      workflowId: catalogId,
      workflowIdConflictPolicy: 'FAIL',
      args: [ catalog, catalogHash ]
    } );
  } );

  it( 'when previous catalog still running with same hash: keeps existing catalog workflow', async () => {
    describeMock.mockResolvedValue( { closeTime: undefined } );
    queryMock.mockResolvedValue( catalogHash );

    const { startCatalog } = await import( './start_catalog.js' );
    await startCatalog( { connection: mockConnection, namespace, catalog, catalogHash } );

    expect( describeMock ).toHaveBeenCalled();
    expect( queryMock ).toHaveBeenCalledWith( 'get_hash' );
    expect( mockLog.info ).toHaveBeenCalledWith( 'Current catalog workflow hash matches worker, restart skipped' );
    expect( executeUpdateMock ).not.toHaveBeenCalled();
    expect( workflowStartMock ).not.toHaveBeenCalled();
  } );

  it( 'when no previous catalog: ignores and starts catalog workflow', async () => {
    describeMock.mockRejectedValue( new WorkflowNotFoundError( 'not found' ) );

    const { startCatalog } = await import( './start_catalog.js' );
    await startCatalog( { connection: mockConnection, namespace, catalog, catalogHash } );

    expect( describeMock ).toHaveBeenCalled();
    expect( queryMock ).not.toHaveBeenCalled();
    expect( mockLog.warn ).not.toHaveBeenCalled();
    expect( mockLog.info ).toHaveBeenCalledWith( 'Starting catalog workflow...' );
    expect( executeUpdateMock ).not.toHaveBeenCalled();
    expect( workflowStartMock ).toHaveBeenCalledWith( 'catalog', {
      taskQueue,
      workflowId: catalogId,
      workflowIdConflictPolicy: 'FAIL',
      args: [ catalog, catalogHash ]
    } );
  } );

  it( 'when previous catalog already closed: skips complete and starts catalog workflow', async () => {
    describeMock.mockResolvedValue( { closeTime: '2024-01-01T00:00:00Z' } );

    const { startCatalog } = await import( './start_catalog.js' );
    await startCatalog( { connection: mockConnection, namespace, catalog, catalogHash } );

    expect( describeMock ).toHaveBeenCalled();
    expect( queryMock ).not.toHaveBeenCalled();
    expect( mockLog.info ).not.toHaveBeenCalledWith( 'Completing previous catalog workflow...' );
    expect( executeUpdateMock ).not.toHaveBeenCalled();
    expect( mockLog.info ).toHaveBeenCalledWith( 'Starting catalog workflow...' );
    expect( workflowStartMock ).toHaveBeenCalledWith( 'catalog', {
      taskQueue,
      workflowId: catalogId,
      workflowIdConflictPolicy: 'FAIL',
      args: [ catalog, catalogHash ]
    } );
  } );

  it( 'when describe or complete fails with other error: logs warn and still starts catalog workflow', async () => {
    describeMock.mockResolvedValue( { closeTime: undefined } );
    queryMock.mockResolvedValue( 'old-catalog-hash' );
    executeUpdateMock.mockRejectedValue( new Error( 'Connection refused' ) );

    const { startCatalog } = await import( './start_catalog.js' );
    await startCatalog( { connection: mockConnection, namespace, catalog, catalogHash } );

    expect( describeMock ).toHaveBeenCalled();
    expect( queryMock ).toHaveBeenCalledWith( 'get_hash' );
    expect( executeUpdateMock ).toHaveBeenCalledWith( 'complete', { args: [] } );
    expect( mockLog.warn ).toHaveBeenCalledWith( 'Error completing previous catalog workflow', {
      error: expect.any( Error )
    } );
    expect( mockLog.info ).toHaveBeenCalledWith( 'Starting catalog workflow...' );
    expect( workflowStartMock ).toHaveBeenCalledWith( 'catalog', {
      taskQueue,
      workflowId: catalogId,
      workflowIdConflictPolicy: 'FAIL',
      args: [ catalog, catalogHash ]
    } );
  } );

  it( 'when another worker starts matching catalog concurrently: ignores already-started error', async () => {
    const alreadyStartedError = new WorkflowExecutionAlreadyStartedError( 'already started', catalogId, 'catalog' );
    describeMock.mockRejectedValue( new WorkflowNotFoundError( 'not found' ) );
    workflowStartMock.mockRejectedValue( alreadyStartedError );
    queryMock.mockResolvedValue( catalogHash );

    const { startCatalog } = await import( './start_catalog.js' );
    await startCatalog( { connection: mockConnection, namespace, catalog, catalogHash } );

    expect( workflowStartMock ).toHaveBeenCalledWith( 'catalog', {
      taskQueue,
      workflowId: catalogId,
      workflowIdConflictPolicy: 'FAIL',
      args: [ catalog, catalogHash ]
    } );
    expect( queryMock ).toHaveBeenCalledWith( 'get_hash' );
    expect( mockLog.info ).toHaveBeenCalledWith(
      'Ignoring start error: it failed because execution already started but catalog hash matches worker'
    );
  } );

  it( 'when another worker starts stale catalog concurrently: rethrows already-started error', async () => {
    const alreadyStartedError = new WorkflowExecutionAlreadyStartedError( 'already started', catalogId, 'catalog' );
    describeMock.mockRejectedValue( new WorkflowNotFoundError( 'not found' ) );
    workflowStartMock.mockRejectedValue( alreadyStartedError );
    queryMock.mockResolvedValue( 'old-catalog-hash' );

    const { startCatalog } = await import( './start_catalog.js' );
    await expect( startCatalog( { connection: mockConnection, namespace, catalog, catalogHash } ) )
      .rejects.toBe( alreadyStartedError );

    expect( queryMock ).toHaveBeenCalledWith( 'get_hash' );
  } );
} );
