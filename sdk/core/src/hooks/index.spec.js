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

    it( 'invokes handler with activity-shaped payload', async () => {
      const handler = vi.fn().mockResolvedValue( undefined );
      onError( handler );

      const err = new Error( 'act-fail' );
      await onHandlers[BusEventType.ACTIVITY_ERROR]( {
        name: 'wf#step',
        workflowName: 'wf',
        error: err
      } );

      expect( handler ).toHaveBeenCalledWith( {
        source: 'activity',
        activityName: 'wf#step',
        workflowName: 'wf',
        error: err
      } );
    } );

    it( 'logs and does not rethrow when handler rejects', async () => {
      const handler = vi.fn().mockRejectedValue( new Error( 'boom' ) );
      onError( handler );

      await onHandlers[BusEventType.RUNTIME_ERROR]( { error: new Error( 'rt' ) } );
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
    it( 'skips catalog workflow name', async () => {
      const handler = vi.fn().mockResolvedValue( undefined );
      onWorkflowStart( handler );

      await Promise.resolve( onHandlers[BusEventType.WORKFLOW_START]( { id: '1', name: WORKFLOW_CATALOG } ) );
      expect( handler ).not.toHaveBeenCalled();

      await Promise.resolve( onHandlers[BusEventType.WORKFLOW_START]( { id: '2', name: 'myWorkflow' } ) );
      expect( handler ).toHaveBeenCalledWith( { id: '2', name: 'myWorkflow' } );
    } );
  } );

  describe( 'onWorkflowEnd', () => {
    it( 'skips catalog workflow name', async () => {
      const handler = vi.fn().mockResolvedValue( undefined );
      onWorkflowEnd( handler );

      await Promise.resolve( onHandlers[BusEventType.WORKFLOW_END]( {
        id: '1',
        name: WORKFLOW_CATALOG,
        duration: 10
      } ) );
      expect( handler ).not.toHaveBeenCalled();

      await Promise.resolve( onHandlers[BusEventType.WORKFLOW_END]( { id: '2', name: 'myWorkflow', duration: 5 } ) );
      expect( handler ).toHaveBeenCalledWith( { id: '2', name: 'myWorkflow', duration: 5 } );
    } );
  } );

  describe( 'onWorkflowError', () => {
    it( 'skips catalog workflow name', async () => {
      const handler = vi.fn().mockResolvedValue( undefined );
      const err = new Error( 'wf' );
      onWorkflowError( handler );

      await Promise.resolve( onHandlers[BusEventType.WORKFLOW_ERROR]( {
        id: '1',
        name: WORKFLOW_CATALOG,
        duration: 1,
        error: err
      } ) );
      expect( handler ).not.toHaveBeenCalled();

      await Promise.resolve( onHandlers[BusEventType.WORKFLOW_ERROR]( {
        id: '2',
        name: 'myWorkflow',
        duration: 2,
        error: err
      } ) );
      expect( handler ).toHaveBeenCalledWith( { id: '2', name: 'myWorkflow', duration: 2, error: err } );
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
