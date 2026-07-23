import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowNotFoundError } from '@temporalio/client';
import { WorkflowExecutionAlreadyStartedError, WorkflowIdConflictPolicy } from '@temporalio/common';
import { CatalogJob } from './catalog_job.js';

const {
  catalogId,
  describeMock,
  executeUpdateMock,
  mockLog,
  taskQueue,
  workflowStartMock
} = vi.hoisted( () => ( {
  catalogId: 'test-catalog',
  describeMock: vi.fn(),
  executeUpdateMock: vi.fn(),
  mockLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  taskQueue: 'test-queue',
  workflowStartMock: vi.fn()
} ) );

vi.mock( '#logger', () => ( { createChildLogger: () => mockLog } ) );
vi.mock( '#consts', () => ( { WORKFLOW_CATALOG: 'catalog' } ) );
vi.mock( '../configs.js', () => ( { catalogId, taskQueue } ) );
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

const mockConnection = {};
const namespace = 'default';
const catalog = { workflows: [], workflowNames: { workflow: 'workflow', alias: 'workflow' }, activities: {} };
const catalogHash = 'catalog-hash';
const startArguments = {
  taskQueue,
  workflowId: catalogId,
  workflowIdConflictPolicy: WorkflowIdConflictPolicy.FAIL,
  args: [ catalog ],
  memo: {
    workflowNames: catalog.workflowNames,
    hash: catalogHash
  }
};

const createJob = () => new CatalogJob( { connection: mockConnection, namespace, catalog, catalogHash } );

const flushPromises = async () => Array
  .from( { length: 10 } )
  .reduce( promise => promise.then( () => Promise.resolve() ), Promise.resolve() );

describe( 'CatalogJob', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    describeMock.mockResolvedValue( { closeTime: '2024-01-01T00:00:00Z' } );
    executeUpdateMock.mockResolvedValue( undefined );
    workflowStartMock.mockResolvedValue( undefined );
  } );

  it( 'completes a previous running stale catalog before starting the new workflow', async () => {
    describeMock.mockResolvedValue( { closeTime: undefined, memo: { hash: 'old-catalog-hash' } } );
    const job = createJob();

    await job.run();

    expect( describeMock ).toHaveBeenCalled();
    expect( executeUpdateMock ).toHaveBeenCalledWith( 'complete', { args: [] } );
    expect( workflowStartMock ).toHaveBeenCalledWith( 'catalog', startArguments );
    expect( job.error ).toBeNull();
    expect( job.running ).toBe( false );
  } );

  it( 'keeps the existing catalog workflow when the running hash matches', async () => {
    describeMock.mockResolvedValue( { closeTime: undefined, memo: { hash: catalogHash } } );
    const job = createJob();

    await job.run();

    expect( executeUpdateMock ).not.toHaveBeenCalled();
    expect( workflowStartMock ).not.toHaveBeenCalled();
    expect( mockLog.info ).toHaveBeenCalledWith( 'Current catalog workflow hash matches worker, restart skipped' );
    expect( job.error ).toBeNull();
  } );

  it( 'starts the catalog workflow when no previous catalog exists', async () => {
    describeMock.mockRejectedValue( new WorkflowNotFoundError( 'not found' ) );
    const job = createJob();

    await job.run();

    expect( describeMock ).toHaveBeenCalled();
    expect( executeUpdateMock ).not.toHaveBeenCalled();
    expect( workflowStartMock ).toHaveBeenCalledWith( 'catalog', startArguments );
    expect( mockLog.warn ).not.toHaveBeenCalled();
  } );

  it( 'starts the catalog workflow when the previous catalog is closed', async () => {
    const job = createJob();

    await job.run();

    expect( describeMock ).toHaveBeenCalled();
    expect( executeUpdateMock ).not.toHaveBeenCalled();
    expect( workflowStartMock ).toHaveBeenCalledWith( 'catalog', startArguments );
  } );

  it( 'warns and continues when describing or completing the previous catalog fails', async () => {
    const completeError = new Error( 'complete failed' );
    describeMock.mockResolvedValue( { closeTime: undefined, memo: { hash: 'old-catalog-hash' } } );
    executeUpdateMock.mockRejectedValue( completeError );
    const job = createJob();

    await job.run();

    expect( mockLog.warn ).toHaveBeenCalledWith( 'Error completing previous catalog workflow', { error: completeError.message } );
    expect( workflowStartMock ).toHaveBeenCalledWith( 'catalog', expect.any( Object ) );
    expect( job.error ).toBeNull();
  } );

  it( 'ignores an already-started error when the running catalog hash matches', async () => {
    const alreadyStartedError = new WorkflowExecutionAlreadyStartedError( 'already started', catalogId, 'catalog' );
    describeMock
      .mockRejectedValueOnce( new WorkflowNotFoundError( 'not found' ) )
      .mockResolvedValueOnce( { closeTime: undefined, memo: { hash: catalogHash } } );
    workflowStartMock.mockRejectedValue( alreadyStartedError );
    const job = createJob();

    await job.run();

    expect( workflowStartMock ).toHaveBeenCalledWith( 'catalog', expect.any( Object ) );
    expect( mockLog.info ).toHaveBeenCalledWith(
      'Ignoring start error: it failed because execution already started but catalog hash matches worker'
    );
    expect( job.error ).toBeNull();
  } );

  it( 'stores start errors and calls the error callback', async () => {
    const error = new Error( 'start failed' );
    const onError = vi.fn();
    workflowStartMock.mockRejectedValue( error );
    const job = createJob();

    job.onError( onError );
    await job.run();

    expect( job.error ).toBe( error );
    expect( onError ).toHaveBeenCalledWith( error );
    expect( job.running ).toBe( false );
  } );

  it( 'stores stale already-started errors and calls the error callback', async () => {
    const alreadyStartedError = new WorkflowExecutionAlreadyStartedError( 'already started', catalogId, 'catalog' );
    const onError = vi.fn();
    describeMock
      .mockRejectedValueOnce( new WorkflowNotFoundError( 'not found' ) )
      .mockResolvedValueOnce( { closeTime: undefined, memo: { hash: 'old-catalog-hash' } } );
    workflowStartMock.mockRejectedValue( alreadyStartedError );
    const job = createJob();

    job.onError( onError );
    await job.run();

    expect( job.error ).toBe( alreadyStartedError );
    expect( onError ).toHaveBeenCalledWith( alreadyStartedError );
    expect( job.running ).toBe( false );
  } );

  it( 'reports running while a catalog call is pending', async () => {
    describeMock.mockReturnValue( new Promise( () => {} ) );
    const job = createJob();

    const run = job.run();
    await flushPromises();

    expect( job.running ).toBe( true );

    await job.interrupt();
    await run;

    expect( job.running ).toBe( false );
    expect( job.error ).toBeNull();
  } );

  it( 'interrupts pending catalog calls without storing an error or calling the callback', async () => {
    const onError = vi.fn();
    describeMock.mockReturnValue( new Promise( () => {} ) );
    const job = createJob();

    job.onError( onError );
    const run = job.run();
    await flushPromises();

    const interrupt = job.interrupt();

    await expect( interrupt ).resolves.toBeUndefined();
    await expect( run ).resolves.toBeUndefined();
    expect( job.error ).toBeNull();
    expect( onError ).not.toHaveBeenCalled();
    expect( job.running ).toBe( false );
  } );

  it( 'returns a resolved promise when interrupted before running', async () => {
    const job = createJob();

    await expect( job.interrupt() ).resolves.toBeUndefined();
    expect( job.running ).toBe( false );
    expect( job.error ).toBeNull();
  } );
} );
