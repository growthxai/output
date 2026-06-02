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

const workflowDetails = {
  workflowId: 'wf-1',
  runId: 'run-1',
  workflowType: 'myWorkflow',
  firstExecutionRunId: 'run-1',
  startTime: 1710000000000,
  runStartTime: 1710000000000,
  attempt: 1
};

const catalogWorkflowDetails = {
  ...workflowDetails,
  workflowType: WORKFLOW_CATALOG
};

const activityInfo = {
  activityId: 'act-1',
  activityType: 'wf#step',
  workflowExecution: { workflowId: 'wf-1', runId: 'run-1' },
  workflowType: 'myWorkflow'
};

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
        activityInfo,
        workflowDetails,
        outputActivityKind: 'step',
        error: err
      } );

      expect( handler ).toHaveBeenCalledWith( {
        eventId: 'evt-act-1',
        source: 'activity',
        activityInfo,
        workflowDetails,
        outputActivityKind: 'step',
        error: err
      } );
    } );

    it( 'invokes handler with workflow-shaped payload, forwarding eventId', async () => {
      const handler = vi.fn().mockResolvedValue( undefined );
      onError( handler );

      const err = new Error( 'wf-fail' );
      await onHandlers[BusEventType.WORKFLOW_ERROR]( {
        eventId: 'evt-wf-1',
        workflowDetails,
        error: err
      } );

      expect( handler ).toHaveBeenCalledWith( {
        eventId: 'evt-wf-1',
        source: 'workflow',
        workflowDetails,
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
        eventId: 'evt-ignored', workflowDetails: catalogWorkflowDetails
      } ) );
      expect( handler ).not.toHaveBeenCalled();

      await Promise.resolve( onHandlers[BusEventType.WORKFLOW_START]( {
        eventId: 'evt-start-1', workflowDetails
      } ) );
      expect( handler ).toHaveBeenCalledWith( {
        eventId: 'evt-start-1', workflowDetails
      } );
    } );
  } );

  describe( 'onWorkflowEnd', () => {
    it( 'skips catalog workflow and forwards eventId for real workflows', async () => {
      const handler = vi.fn().mockResolvedValue( undefined );
      onWorkflowEnd( handler );

      await Promise.resolve( onHandlers[BusEventType.WORKFLOW_END]( {
        eventId: 'evt-ignored', workflowDetails: catalogWorkflowDetails
      } ) );
      expect( handler ).not.toHaveBeenCalled();

      await Promise.resolve( onHandlers[BusEventType.WORKFLOW_END]( {
        eventId: 'evt-end-1', workflowDetails
      } ) );
      expect( handler ).toHaveBeenCalledWith( {
        eventId: 'evt-end-1', workflowDetails
      } );
    } );
  } );

  describe( 'onWorkflowError', () => {
    it( 'skips catalog workflow and forwards eventId for real workflows', async () => {
      const handler = vi.fn().mockResolvedValue( undefined );
      const err = new Error( 'wf' );
      onWorkflowError( handler );

      await Promise.resolve( onHandlers[BusEventType.WORKFLOW_ERROR]( {
        eventId: 'evt-ignored', workflowDetails: catalogWorkflowDetails, error: err
      } ) );
      expect( handler ).not.toHaveBeenCalled();

      await Promise.resolve( onHandlers[BusEventType.WORKFLOW_ERROR]( {
        eventId: 'evt-err-1', workflowDetails, error: err
      } ) );
      expect( handler ).toHaveBeenCalledWith( {
        eventId: 'evt-err-1', workflowDetails, error: err
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
