import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BusEventType } from '#consts';

const logErrorMock = vi.hoisted( () => vi.fn() );
const createChildLoggerMock = vi.hoisted( () =>
  vi.fn( () => ( { error: logErrorMock } ) )
);

const mainOnHandlers = vi.hoisted( () => ( {} ) );
const stepOnHandlers = vi.hoisted( () => ( {} ) );
const mainEventBusMock = vi.hoisted( () => ( {
  on: vi.fn( ( eventType, handler ) => {
    mainOnHandlers[eventType] = handler;
  } )
} ) );
const stepEventBusMock = vi.hoisted( () => ( {
  emit: vi.fn( () => true ),
  on: vi.fn( ( eventType, handler ) => {
    stepOnHandlers[eventType] = handler;
  } )
} ) );

vi.mock( '#logger', () => ( { createChildLogger: createChildLoggerMock } ) );
vi.mock( '#bus', () => ( {
  mainEventBus: mainEventBusMock,
  stepEventBus: stepEventBusMock
} ) );

import {
  emit,
  on,
  onActivityEnd,
  onActivityError,
  onActivityStart,
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

const activityInfo = {
  activityId: 'act-1',
  activityType: 'wf#step',
  workflowExecution: { workflowId: 'wf-1', runId: 'run-1' },
  workflowType: 'myWorkflow'
};

const eventDate = 1710000001234;

const aggregations = {
  cost: { total: 0 },
  tokens: { total: 0 },
  httpRequests: { total: 1 }
};

describe( 'hooks/index', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    Object.keys( mainOnHandlers ).forEach( k => {
      delete mainOnHandlers[k];
    } );
    Object.keys( stepOnHandlers ).forEach( k => {
      delete stepOnHandlers[k];
    } );
  } );

  describe( 'onError', () => {
    it( 'registers activity, workflow, and runtime error listeners', () => {
      const handler = vi.fn().mockResolvedValue( undefined );
      onError( handler );

      expect( mainEventBusMock.on ).toHaveBeenCalledWith( BusEventType.ACTIVITY_ERROR, expect.any( Function ) );
      expect( mainEventBusMock.on ).toHaveBeenCalledWith( BusEventType.WORKFLOW_ERROR, expect.any( Function ) );
      expect( mainEventBusMock.on ).toHaveBeenCalledWith( BusEventType.RUNTIME_ERROR, expect.any( Function ) );
    } );

    it( 'invokes handler with activity-shaped payload, forwarding bus fields', async () => {
      const handler = vi.fn().mockResolvedValue( undefined );
      onError( handler );

      const err = new Error( 'act-fail' );
      await mainOnHandlers[BusEventType.ACTIVITY_ERROR]( {
        eventId: 'evt-act-1',
        eventDate,
        activityInfo,
        workflowDetails,
        outputActivityKind: 'step',
        error: err,
        extra: 'passthrough'
      } );

      expect( handler ).toHaveBeenCalledWith( {
        eventId: 'evt-act-1',
        eventDate,
        source: 'activity',
        activityInfo,
        workflowDetails,
        outputActivityKind: 'step',
        error: err,
        extra: 'passthrough'
      } );
    } );

    it( 'invokes handler with workflow-shaped payload, forwarding bus fields', async () => {
      const handler = vi.fn().mockResolvedValue( undefined );
      onError( handler );

      const err = new Error( 'wf-fail' );
      await mainOnHandlers[BusEventType.WORKFLOW_ERROR]( {
        eventId: 'evt-wf-1',
        eventDate,
        workflowDetails,
        error: err,
        extra: 'passthrough'
      } );

      expect( handler ).toHaveBeenCalledWith( {
        eventId: 'evt-wf-1',
        eventDate,
        source: 'workflow',
        workflowDetails,
        error: err,
        extra: 'passthrough'
      } );
    } );

    it( 'logs and does not rethrow when handler rejects', async () => {
      const handler = vi.fn().mockRejectedValue( new Error( 'boom' ) );
      onError( handler );

      const error = new Error( 'rt' );
      await mainOnHandlers[BusEventType.RUNTIME_ERROR]( { eventId: 'evt-rt-1', eventDate, error } );

      expect( handler ).toHaveBeenCalledWith( { eventId: 'evt-rt-1', eventDate, source: 'runtime', error } );
    } );
  } );

  describe( 'onBeforeWorkerStart', () => {
    it( 'registers and invokes handler with undefined payload', async () => {
      const handler = vi.fn().mockResolvedValue( undefined );
      onBeforeWorkerStart( handler );

      expect( mainEventBusMock.on ).toHaveBeenCalledWith( BusEventType.WORKER_BEFORE_START, expect.any( Function ) );
      await mainOnHandlers[BusEventType.WORKER_BEFORE_START]();

      expect( handler ).toHaveBeenCalledWith( undefined );
    } );
  } );

  describe( 'workflow lifecycle hooks', () => {
    const cases = [
      [ 'onWorkflowStart', onWorkflowStart, BusEventType.WORKFLOW_START, {} ],
      [ 'onWorkflowEnd', onWorkflowEnd, BusEventType.WORKFLOW_END, {} ],
      [ 'onWorkflowError', onWorkflowError, BusEventType.WORKFLOW_ERROR, { error: new Error( 'workflow failed' ) } ]
    ];

    it.each( cases )( '%s forwards bus fields', async ( _name, registerHook, eventType, extraFields ) => {
      const handler = vi.fn().mockResolvedValue( undefined );
      const payload = {
        eventId: 'evt-workflow-1',
        eventDate,
        workflowDetails,
        extra: 'passthrough',
        ...extraFields
      };
      registerHook( handler );

      expect( mainEventBusMock.on ).toHaveBeenCalledWith( eventType, expect.any( Function ) );
      await mainOnHandlers[eventType]( payload );

      expect( handler ).toHaveBeenCalledWith( payload );
    } );
  } );

  describe( 'activity lifecycle hooks', () => {
    const cases = [
      [ 'onActivityStart', onActivityStart, BusEventType.ACTIVITY_START, undefined ],
      [ 'onActivityEnd', onActivityEnd, BusEventType.ACTIVITY_END, { aggregations } ],
      [ 'onActivityError', onActivityError, BusEventType.ACTIVITY_ERROR, { error: new Error( 'activity failed' ) } ]
    ];

    it.each( cases )( '%s forwards internal activity bus fields', async ( _name, registerHook, eventType, extraFields = {} ) => {
      const handler = vi.fn().mockResolvedValue( undefined );
      const payload = {
        eventId: 'evt-activity-1',
        eventDate,
        activityInfo,
        workflowDetails,
        outputActivityKind: 'internal_step',
        extra: 'passthrough',
        ...extraFields
      };
      registerHook( handler );

      expect( mainEventBusMock.on ).toHaveBeenCalledWith( eventType, expect.any( Function ) );
      await mainOnHandlers[eventType]( payload );

      expect( handler ).toHaveBeenCalledWith( payload );
    } );
  } );

  describe( 'on', () => {
    it( 'subscribes to SDK and user event channels and forwards payloads', async () => {
      const handler = vi.fn().mockResolvedValue( undefined );
      on( 'myEvent', handler );

      expect( stepEventBusMock.on ).toHaveBeenCalledWith( 'sdk:myEvent', expect.any( Function ) );
      expect( stepEventBusMock.on ).toHaveBeenCalledWith( 'usr:myEvent', expect.any( Function ) );
      await stepOnHandlers['sdk:myEvent']( { payload: { source: 'sdk' } } );
      await stepOnHandlers['usr:myEvent']( { payload: { source: 'user' } } );

      expect( handler ).toHaveBeenNthCalledWith( 1, { payload: { source: 'sdk' } } );
      expect( handler ).toHaveBeenNthCalledWith( 2, { payload: { source: 'user' } } );
    } );
  } );

  describe( 'emit', () => {
    it( 'emits payloads on the user event channel', () => {
      const payload = { foo: 1 };

      const emitted = emit( 'myEvent', payload );

      expect( stepEventBusMock.emit ).toHaveBeenCalledWith( 'usr:myEvent', payload );
      expect( emitted ).toBe( true );
    } );
  } );
} );
