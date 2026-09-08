import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowNotFoundError } from '@temporalio/client';
import { WorkflowExecutionAlreadyStartedError, WorkflowIdConflictPolicy } from '@temporalio/common';
import { CatalogPublisher } from './catalog_publisher.js';

const {
  catalogId,
  describeMock,
  getHandleMock,
  mockLog,
  serializeErrorMock,
  sleepMock,
  startMock,
  taskQueue,
  terminateMock
} = vi.hoisted( () => ( {
  catalogId: 'test-catalog',
  describeMock: vi.fn(),
  getHandleMock: vi.fn(),
  mockLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  serializeErrorMock: vi.fn( error => ( { message: error.message } ) ),
  sleepMock: vi.fn(),
  startMock: vi.fn(),
  taskQueue: 'test-queue',
  terminateMock: vi.fn()
} ) );

vi.mock( '#logger', () => ( { createChildLogger: () => mockLog } ) );
vi.mock( '#helpers/error_serializer', () => ( { serializeError: serializeErrorMock } ) );
vi.mock( '#consts', () => ( { WORKFLOW_CATALOG: 'catalog' } ) );
vi.mock( '#helpers/promise', () => ( { sleepCancellable: sleepMock } ) );
vi.mock( '../configs.js', () => ( { catalogId, taskQueue } ) );
vi.mock( '@temporalio/client', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    Client: vi.fn().mockImplementation( function () {
      return { workflow: { start: startMock, getHandle: getHandleMock } };
    } )
  };
} );

const RETRY_DELAY = 10_000;
const namespace = 'default';
const catalogHash = 'catalog-hash';
const catalog = { workflows: [], workflowNames: { workflow: 'workflow' }, activities: {} };

const startArguments = {
  taskQueue,
  workflowId: catalogId,
  workflowIdConflictPolicy: WorkflowIdConflictPolicy.FAIL,
  workflowTaskTimeout: 30_000,
  args: [ catalog ],
  memo: {
    workflowNames: catalog.workflowNames,
    hash: catalogHash
  }
};

const compactError = message => ( { error: { message } } );

const running = hash => ( { closeTime: undefined, runId: 'run-1', memo: { hash } } );
const notFound = () => new WorkflowNotFoundError( 'not found' );
const alreadyStarted = () => new WorkflowExecutionAlreadyStartedError( 'already started', catalogId, 'catalog' );

const createPublisher = ( signal = new AbortController().signal ) =>
  new CatalogPublisher( { connection: {}, namespace, catalog, catalogHash, signal } );

const flushPromises = async () => Array
  .from( { length: 10 } )
  .reduce( promise => promise.then( () => Promise.resolve() ), Promise.resolve() );

describe( 'CatalogPublisher', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    getHandleMock.mockReturnValue( { describe: describeMock, terminate: terminateMock } );
    describeMock.mockRejectedValue( notFound() );
    terminateMock.mockResolvedValue( undefined );
    startMock.mockResolvedValue( undefined );
    sleepMock.mockResolvedValue( undefined );
  } );

  describe( 'publish paths', () => {
    it( 'starts the catalog when nothing is running', async () => {
      const publisher = createPublisher();

      await publisher.run();

      expect( terminateMock ).not.toHaveBeenCalled();
      expect( startMock ).toHaveBeenCalledWith( 'catalog', startArguments );
      expect( mockLog.info ).toHaveBeenCalledWith( 'Catalog workflow started' );
      expect( mockLog.warn ).not.toHaveBeenCalled();
      expect( publisher.running ).toBe( false );
    } );

    it( 'starts the catalog when the previous one is closed', async () => {
      describeMock.mockResolvedValue( { closeTime: '2024-01-01T00:00:00Z' } );

      await createPublisher().run();

      expect( terminateMock ).not.toHaveBeenCalled();
      expect( startMock ).toHaveBeenCalledWith( 'catalog', startArguments );
    } );

    it( 'skips the restart when the running hash matches', async () => {
      describeMock.mockResolvedValue( running( catalogHash ) );

      await createPublisher().run();

      expect( terminateMock ).not.toHaveBeenCalled();
      expect( startMock ).not.toHaveBeenCalled();
      expect( mockLog.info ).toHaveBeenCalledWith( 'Current catalog workflow hash matches worker, restart skipped' );
    } );

    it( 'terminates and starts when the running catalog carries no memo', async () => {
      describeMock.mockResolvedValue( { closeTime: undefined, runId: 'run-1', memo: undefined } );

      await createPublisher().run();

      expect( mockLog.warn ).not.toHaveBeenCalled();
      expect( terminateMock ).toHaveBeenCalledOnce();
      expect( startMock ).toHaveBeenCalledWith( 'catalog', startArguments );
    } );

    it( 'terminates the pinned run then starts when the running hash differs', async () => {
      describeMock.mockResolvedValue( running( 'old-hash' ) );

      await createPublisher().run();

      expect( getHandleMock ).toHaveBeenCalledWith( catalogId, 'run-1' );
      expect( terminateMock ).toHaveBeenCalledWith( `Systematic terminating. Superseded by catalog ${catalogHash}` );
      expect( startMock ).toHaveBeenCalledWith( 'catalog', startArguments );
    } );
  } );

  describe( 'race paths', () => {
    it( 'ignores an already started error when the published hash matches', async () => {
      describeMock
        .mockRejectedValueOnce( notFound() )
        .mockResolvedValueOnce( running( catalogHash ) );
      startMock.mockRejectedValue( alreadyStarted() );

      await createPublisher().run();

      expect( startMock ).toHaveBeenCalledOnce();
      expect( terminateMock ).not.toHaveBeenCalled();
      expect( mockLog.info ).toHaveBeenCalledWith( 'Found a catalog workflow with matching hashes, start skipped' );
      expect( mockLog.info ).not.toHaveBeenCalledWith( 'Catalog workflow started' );
    } );

    it( 'retires the winner on retry when an already started error exposes a different hash', async () => {
      describeMock
        .mockRejectedValueOnce( notFound() )
        .mockResolvedValue( running( 'other-hash' ) );
      startMock
        .mockRejectedValueOnce( alreadyStarted() )
        .mockResolvedValue( undefined );

      await createPublisher().run();

      expect( sleepMock ).toHaveBeenCalledOnce();
      expect( terminateMock ).toHaveBeenCalledOnce();
      expect( startMock ).toHaveBeenCalledTimes( 2 );
      expect( mockLog.warn ).toHaveBeenCalledWith(
        'Error while starting catalog workflow, retrying...',
        compactError( 'already started' )
      );
    } );

    it( 'warns and attempts a start when describing fails', async () => {
      const error = new Error( 'describe failed' );
      describeMock.mockRejectedValue( error );

      await createPublisher().run();

      expect( serializeErrorMock ).toHaveBeenCalledWith( error, { dropKeys: [ 'stack' ] } );
      expect( mockLog.warn ).toHaveBeenCalledWith(
        'Ignoring error while describing catalog workflow',
        compactError( 'describe failed' )
      );
      expect( startMock ).toHaveBeenCalledWith( 'catalog', startArguments );
    } );

    it( 'warns and still starts when terminating the previous catalog fails', async () => {
      describeMock.mockResolvedValue( running( 'old-hash' ) );
      terminateMock.mockRejectedValue( new Error( 'terminate failed' ) );

      await createPublisher().run();

      expect( mockLog.warn ).toHaveBeenCalledWith(
        'Ignoring error while terminating previous catalog workflow',
        compactError( 'terminate failed' )
      );
      expect( startMock ).toHaveBeenCalledWith( 'catalog', startArguments );
    } );
  } );

  describe( 'failure', () => {
    it( 'rejects with the original error after exhausting the retries', async () => {
      const error = new Error( 'start failed' );
      startMock.mockRejectedValue( error );
      const publisher = createPublisher();

      await expect( publisher.run() ).rejects.toBe( error );

      expect( startMock ).toHaveBeenCalledTimes( 3 );
      expect( sleepMock ).toHaveBeenCalledTimes( 2 );
      expect( publisher.running ).toBe( false );
    } );

    it( 'waits the retry delay with the abort signal between attempts', async () => {
      startMock.mockRejectedValue( new Error( 'start failed' ) );

      await expect( createPublisher().run() ).rejects.toThrow( 'start failed' );

      expect( sleepMock ).toHaveBeenCalledWith( RETRY_DELAY, expect.any( AbortSignal ) );
    } );
  } );

  describe( 'abort paths', () => {
    it( 'publishes nothing when already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect( createPublisher( controller.signal ).run() ).resolves.toBeUndefined();

      expect( describeMock ).not.toHaveBeenCalled();
      expect( startMock ).not.toHaveBeenCalled();
    } );

    it( 'stops retrying when the signal aborts during the backoff', async () => {
      const controller = new AbortController();
      startMock.mockRejectedValue( new Error( 'start failed' ) );
      sleepMock.mockImplementation( async () => controller.abort() );

      await expect( createPublisher( controller.signal ).run() ).resolves.toBeUndefined();

      expect( startMock ).toHaveBeenCalledOnce();
      expect( sleepMock ).toHaveBeenCalledOnce();
    } );

    it( 'stops retrying when interrupted during the backoff', async () => {
      startMock.mockRejectedValue( new Error( 'start failed' ) );
      const publisher = createPublisher();
      sleepMock.mockImplementation( async () => {
        publisher.interrupt();
      } );

      await expect( publisher.run() ).resolves.toBeUndefined();

      expect( startMock ).toHaveBeenCalledOnce();
    } );

    it( 'still starts when the abort lands between terminating and starting', async () => {
      const controller = new AbortController();
      describeMock.mockResolvedValue( running( 'old-hash' ) );
      terminateMock.mockImplementation( async () => controller.abort() );

      await createPublisher( controller.signal ).run();

      expect( terminateMock ).toHaveBeenCalledOnce();
      expect( startMock ).toHaveBeenCalledWith( 'catalog', startArguments );
    } );
  } );

  describe( 'lifecycle', () => {
    it( 'reports running while the sequence is pending', async () => {
      const deferred = {};
      describeMock.mockReturnValue( new Promise( resolve => {
        deferred.resolve = resolve;
      } ) );
      const publisher = createPublisher();

      const run = publisher.run();
      await flushPromises();

      expect( publisher.running ).toBe( true );

      deferred.resolve( running( catalogHash ) );
      await run;

      expect( publisher.running ).toBe( false );
    } );

    it( 'returns the same execution and publishes once when run more than once', async () => {
      const publisher = createPublisher();

      const first = publisher.run();
      const second = publisher.run();

      expect( second ).toBe( first );

      await first;

      expect( describeMock ).toHaveBeenCalledOnce();
      expect( startMock ).toHaveBeenCalledOnce();
    } );

    it( 'resolves when interrupted before running', async () => {
      const publisher = createPublisher();

      await expect( publisher.interrupt() ).resolves.toBeUndefined();

      expect( publisher.running ).toBe( false );
      expect( describeMock ).not.toHaveBeenCalled();
    } );

    it( 'reports the failure when interrupting after a rejected run', async () => {
      startMock.mockRejectedValue( new Error( 'start failed' ) );
      const publisher = createPublisher();

      await expect( publisher.run() ).rejects.toThrow( 'start failed' );

      await expect( publisher.interrupt() ).rejects.toThrow( 'start failed' );
    } );
  } );
} );
