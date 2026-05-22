import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BusEventType, WORKFLOW_CATALOG } from '#consts';

const logErrorMock = vi.hoisted( () => vi.fn() );
const createChildLoggerMock = vi.hoisted( () =>
  vi.fn( () => ( { error: logErrorMock } ) )
);

const onHandlers = vi.hoisted( () => ( {} ) );
const messageBusMock = vi.hoisted( () => ( {
  on: vi.fn( ( eventType, handler ) => {
    onHandlers[eventType] = handler;
  } )
} ) );

vi.mock( '#logger', () => ( { createChildLogger: createChildLoggerMock } ) );
vi.mock( '#bus', () => ( { messageBus: messageBusMock } ) );

import {
  on,
  onBeforeWorkerStart,
  onError,
  onWorkflowEnd,
  onWorkflowError,
  onWorkflowStart
} from './index.js';

describe( 'hooks/index', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    Object.keys( onHandlers ).forEach( k => {
      delete onHandlers[k];
    } );
  } );

  describe( 'onError', () => {
    it( 'registers activity, workflow, and runtime error listeners', () => {
      const handler = vi.fn().mockResolvedValue( undefined );
      onError( handler );

      expect( messageBusMock.on ).toHaveBeenCalledWith( BusEventType.ACTIVITY_ERROR, expect.any( Function ) );
      expect( messageBusMock.on ).toHaveBeenCalledWith( BusEventType.WORKFLOW_ERROR, expect.any( Function ) );
      expect( messageBusMock.on ).toHaveBeenCalledWith( BusEventType.RUNTIME_ERROR, expect.any( Function ) );
    } );

    it( 'invokes handler with activity-shaped payload, forwarding eventId', async () => {
      const handler = vi.fn().mockResolvedValue( undefined );
      onError( handler );

      const err = new Error( 'act-fail' );
      await onHandlers[BusEventType.ACTIVITY_ERROR]( {
        eventId: 'evt-act-1',
        id: 'act-1',
        name: 'wf#step',
        workflowId: 'wf-run-1',
        workflowName: 'wf',
        error: err
      } );

      expect( handler ).toHaveBeenCalledWith( {
        eventId: 'evt-act-1',
        source: 'activity',
        activityId: 'act-1',
        activityName: 'wf#step',
        workflowId: 'wf-run-1',
        workflowName: 'wf',
        error: err
      } );
    } );

    it( 'invokes handler with workflow-shaped payload, forwarding eventId', async () => {
      const handler = vi.fn().mockResolvedValue( undefined );
      onError( handler );

      const err = new Error( 'wf-fail' );
      await onHandlers[BusEventType.WORKFLOW_ERROR]( {
        eventId: 'evt-wf-1',
        id: 'wf-run-2',
        name: 'myWorkflow',
        error: err
      } );

      expect( handler ).toHaveBeenCalledWith( {
        eventId: 'evt-wf-1',
        source: 'workflow',
        workflowId: 'wf-run-2',
        workflowName: 'myWorkflow',
        error: err
      } );
    } );

    it( 'logs and does not rethrow when handler rejects', async () => {
      const handler = vi.fn().mockRejectedValue( new Error( 'boom' ) );
      onError( handler );

      const error = new Error( 'rt' );
      await onHandlers[BusEventType.RUNTIME_ERROR]( { eventId: 'evt-rt-1', error } );

      expect( handler ).toHaveBeenCalledWith( { eventId: 'evt-rt-1', source: 'runtime', error } );
    } );
  } );

  describe( 'onBeforeWorkerStart', () => {
    it( 'registers and invokes handler with undefined payload', async () => {
      const handler = vi.fn().mockResolvedValue( undefined );
      onBeforeWorkerStart( handler );

      expect( messageBusMock.on ).toHaveBeenCalledWith( BusEventType.WORKER_BEFORE_START, expect.any( Function ) );
      await onHandlers[BusEventType.WORKER_BEFORE_START]();

      expect( handler ).toHaveBeenCalledWith( undefined );
    } );
  } );

  describe( 'onWorkflowStart', () => {
    it( 'skips catalog workflow and forwards eventId for real workflows', async () => {
      const handler = vi.fn().mockResolvedValue( undefined );
      onWorkflowStart( handler );

      await Promise.resolve( onHandlers[BusEventType.WORKFLOW_START]( {
        eventId: 'evt-ignored', id: '1', name: WORKFLOW_CATALOG
      } ) );
      expect( handler ).not.toHaveBeenCalled();

      await Promise.resolve( onHandlers[BusEventType.WORKFLOW_START]( {
        eventId: 'evt-start-1', id: '2', runId: 'run-2', name: 'myWorkflow'
      } ) );
      expect( handler ).toHaveBeenCalledWith( {
        eventId: 'evt-start-1', id: '2', runId: 'run-2', name: 'myWorkflow'
      } );
    } );
  } );

  describe( 'onWorkflowEnd', () => {
    it( 'skips catalog workflow and forwards eventId for real workflows', async () => {
      const handler = vi.fn().mockResolvedValue( undefined );
      onWorkflowEnd( handler );

      await Promise.resolve( onHandlers[BusEventType.WORKFLOW_END]( {
        eventId: 'evt-ignored', id: '1', name: WORKFLOW_CATALOG, duration: 10
      } ) );
      expect( handler ).not.toHaveBeenCalled();

      await Promise.resolve( onHandlers[BusEventType.WORKFLOW_END]( {
        eventId: 'evt-end-1', id: '2', runId: 'run-2', name: 'myWorkflow', duration: 5
      } ) );
      expect( handler ).toHaveBeenCalledWith( {
        eventId: 'evt-end-1', id: '2', runId: 'run-2', name: 'myWorkflow', duration: 5
      } );
    } );
  } );

  describe( 'onWorkflowError', () => {
    it( 'skips catalog workflow and forwards eventId for real workflows', async () => {
      const handler = vi.fn().mockResolvedValue( undefined );
      const err = new Error( 'wf' );
      onWorkflowError( handler );

      await Promise.resolve( onHandlers[BusEventType.WORKFLOW_ERROR]( {
        eventId: 'evt-ignored', id: '1', name: WORKFLOW_CATALOG, duration: 1, error: err
      } ) );
      expect( handler ).not.toHaveBeenCalled();

      await Promise.resolve( onHandlers[BusEventType.WORKFLOW_ERROR]( {
        eventId: 'evt-err-1', id: '2', runId: 'run-2', name: 'myWorkflow', duration: 2, error: err
      } ) );
      expect( handler ).toHaveBeenCalledWith( {
        eventId: 'evt-err-1', id: '2', runId: 'run-2', name: 'myWorkflow', duration: 2, error: err
      } );
    } );
  } );

  describe( 'on', () => {
    it( 'subscribes to external event channel and forwards payload', async () => {
      const handler = vi.fn().mockResolvedValue( undefined );
      on( 'myEvent', handler );

      expect( messageBusMock.on ).toHaveBeenCalledWith( 'external:myEvent', expect.any( Function ) );
      await onHandlers['external:myEvent']( { foo: 1 } );

      expect( handler ).toHaveBeenCalledWith( { foo: 1 } );
    } );
  } );
} );
