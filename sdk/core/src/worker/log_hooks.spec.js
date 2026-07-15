import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ACTIVITY_GET_TRACE_DESTINATIONS,
  BusEventType,
  LifecycleEvent,
  WORKFLOW_CATALOG
} from '#consts';

const createLoggerMock = vi.hoisted( () => () => ( {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  http: vi.fn(),
  verbose: vi.fn(),
  debug: vi.fn(),
  silly: vi.fn()
} ) );
const activityLogMock = vi.hoisted( () => createLoggerMock() );
const workflowLogMock = vi.hoisted( () => createLoggerMock() );
const createChildLoggerMock = vi.hoisted( () =>
  vi.fn( name => ( name === 'Activity' ? activityLogMock : workflowLogMock ) )
);

const onHandlers = vi.hoisted( () => ( {} ) );
const mainEventBusMock = vi.hoisted( () => ( {
  on: vi.fn( ( eventType, handler ) => {
    onHandlers[eventType] = handler;
  } )
} ) );

vi.mock( '#logger', () => ( { createChildLogger: createChildLoggerMock } ) );
vi.mock( '#bus', () => ( { mainEventBus: mainEventBusMock } ) );

import './log_hooks.js';

describe( 'log_hooks', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  describe( 'activity events', () => {
    const activityInfo = {
      activityId: 'act-1',
      activityType: 'myWorkflow#myStep',
      workflowExecution: { workflowId: 'wf-1', runId: 'run-1' },
      workflowType: 'myWorkflow'
    };
    const basePayload = {
      activityInfo,
      outputActivityKind: 'step'
    };

    it( 'ACTIVITY_START logs full message and second arg', () => {
      onHandlers[BusEventType.ACTIVITY_START]( basePayload );

      expect( activityLogMock.info ).toHaveBeenCalledTimes( 1 );
      expect( activityLogMock.info ).toHaveBeenCalledWith(
        'Started myWorkflow#myStep step',
        {
          event: LifecycleEvent.START,
          activityId: 'act-1',
          activityType: 'myWorkflow#myStep',
          workflowId: 'wf-1',
          workflowType: 'myWorkflow',
          runId: 'run-1'
        }
      );
    } );

    it( 'ACTIVITY_START does not log trace destination activity', () => {
      onHandlers[BusEventType.ACTIVITY_START]( {
        ...basePayload,
        activityInfo: { ...activityInfo, activityType: ACTIVITY_GET_TRACE_DESTINATIONS }
      } );

      expect( activityLogMock.info ).not.toHaveBeenCalled();
    } );

    it( 'ACTIVITY_END logs full message and second arg', () => {
      onHandlers[BusEventType.ACTIVITY_END]( { ...basePayload, duration: 42 } );

      expect( activityLogMock.info ).toHaveBeenCalledTimes( 1 );
      expect( activityLogMock.info ).toHaveBeenCalledWith(
        'Ended myWorkflow#myStep step',
        {
          event: LifecycleEvent.END,
          activityId: 'act-1',
          activityType: 'myWorkflow#myStep',
          workflowId: 'wf-1',
          workflowType: 'myWorkflow',
          runId: 'run-1'
        }
      );
    } );

    it( 'ACTIVITY_END does not log trace destination activity', () => {
      onHandlers[BusEventType.ACTIVITY_END]( {
        ...basePayload,
        activityInfo: { ...activityInfo, activityType: ACTIVITY_GET_TRACE_DESTINATIONS }
      } );

      expect( activityLogMock.info ).not.toHaveBeenCalled();
    } );

    it( 'ACTIVITY_ERROR logs full message and second arg', () => {
      const err = new Error( 'step failed' );
      onHandlers[BusEventType.ACTIVITY_ERROR]( {
        ...basePayload,
        duration: 100,
        error: err
      } );

      expect( activityLogMock.error ).toHaveBeenCalledTimes( 1 );
      expect( activityLogMock.error ).toHaveBeenCalledWith(
        'Error myWorkflow#myStep step: Error',
        {
          event: LifecycleEvent.ERROR,
          activityId: 'act-1',
          activityType: 'myWorkflow#myStep',
          workflowId: 'wf-1',
          workflowType: 'myWorkflow',
          runId: 'run-1',
          error: 'step failed'
        }
      );
    } );

    it( 'ACTIVITY_ERROR does not log trace destination activity', () => {
      onHandlers[BusEventType.ACTIVITY_ERROR]( {
        ...basePayload,
        activityInfo: { ...activityInfo, activityType: ACTIVITY_GET_TRACE_DESTINATIONS },
        error: new Error( 'x' )
      } );

      expect( activityLogMock.error ).not.toHaveBeenCalled();
    } );

    it( 'ACTIVITY_LOG logs dynamic levels with metadata and serialized activity fields', () => {
      onHandlers[BusEventType.ACTIVITY_LOG]( {
        activityInfo,
        level: 'debug',
        message: 'activity detail',
        metadata: {
          custom: 'value',
          workflowId: 'metadata-workflow-id'
        }
      } );

      expect( activityLogMock.debug ).toHaveBeenCalledTimes( 1 );
      expect( activityLogMock.debug ).toHaveBeenCalledWith( 'activity detail', {
        custom: 'value',
        activityId: 'act-1',
        activityType: 'myWorkflow#myStep',
        workflowId: 'wf-1',
        workflowType: 'myWorkflow',
        runId: 'run-1'
      } );
    } );

    it( 'ACTIVITY_LOG accepts omitted metadata', () => {
      onHandlers[BusEventType.ACTIVITY_LOG]( {
        activityInfo,
        level: 'info',
        message: 'activity detail'
      } );

      expect( activityLogMock.info ).toHaveBeenCalledWith( 'activity detail', {
        activityId: 'act-1',
        activityType: 'myWorkflow#myStep',
        workflowId: 'wf-1',
        workflowType: 'myWorkflow',
        runId: 'run-1'
      } );
    } );
  } );

  describe( 'workflow events', () => {
    const workflowDetails = {
      workflowId: 'wf-1',
      workflowType: 'myWorkflow',
      runId: 'run-1'
    };
    const basePayload = { workflowDetails };

    it( 'WORKFLOW_START logs full message and second arg', () => {
      onHandlers[BusEventType.WORKFLOW_START]( basePayload );

      expect( workflowLogMock.info ).toHaveBeenCalledTimes( 1 );
      expect( workflowLogMock.info ).toHaveBeenCalledWith(
        'Started myWorkflow workflow',
        {
          event: LifecycleEvent.START,
          workflowId: 'wf-1',
          workflowType: 'myWorkflow',
          runId: 'run-1'
        }
      );
    } );

    it( 'WORKFLOW_START does not log when workflowType is WORKFLOW_CATALOG', () => {
      onHandlers[BusEventType.WORKFLOW_START]( {
        workflowDetails: { ...workflowDetails, workflowType: WORKFLOW_CATALOG }
      } );

      expect( workflowLogMock.info ).not.toHaveBeenCalled();
    } );

    it( 'WORKFLOW_END logs full message and second arg', () => {
      onHandlers[BusEventType.WORKFLOW_END]( basePayload );

      expect( workflowLogMock.info ).toHaveBeenCalledTimes( 1 );
      expect( workflowLogMock.info ).toHaveBeenCalledWith(
        'Ended myWorkflow workflow',
        {
          event: LifecycleEvent.END,
          workflowId: 'wf-1',
          workflowType: 'myWorkflow',
          runId: 'run-1'
        }
      );
    } );

    it( 'WORKFLOW_END does not log when workflowType is WORKFLOW_CATALOG', () => {
      onHandlers[BusEventType.WORKFLOW_END]( {
        workflowDetails: { ...workflowDetails, workflowType: WORKFLOW_CATALOG }
      } );

      expect( workflowLogMock.info ).not.toHaveBeenCalled();
    } );

    it( 'WORKFLOW_ERROR logs full message and second arg', () => {
      const err = new TypeError( 'workflow boom' );
      onHandlers[BusEventType.WORKFLOW_ERROR]( {
        ...basePayload,
        duration: 150,
        error: err
      } );

      expect( workflowLogMock.error ).toHaveBeenCalledTimes( 1 );
      expect( workflowLogMock.error ).toHaveBeenCalledWith(
        'Error myWorkflow workflow: TypeError',
        {
          event: LifecycleEvent.ERROR,
          workflowId: 'wf-1',
          workflowType: 'myWorkflow',
          runId: 'run-1',
          error: 'workflow boom'
        }
      );
    } );

    it( 'WORKFLOW_ERROR does not log when workflowType is WORKFLOW_CATALOG', () => {
      onHandlers[BusEventType.WORKFLOW_ERROR]( {
        workflowDetails: { ...workflowDetails, workflowType: WORKFLOW_CATALOG },
        error: new Error( 'x' )
      } );

      expect( workflowLogMock.error ).not.toHaveBeenCalled();
    } );

    it( 'WORKFLOW_LOG logs dynamic levels with metadata and serialized workflow fields', () => {
      onHandlers[BusEventType.WORKFLOW_LOG]( {
        workflowDetails,
        level: 'warn',
        message: 'workflow detail',
        metadata: {
          custom: 'value',
          runId: 'metadata-run-id'
        }
      } );

      expect( workflowLogMock.warn ).toHaveBeenCalledTimes( 1 );
      expect( workflowLogMock.warn ).toHaveBeenCalledWith( 'workflow detail', {
        custom: 'value',
        workflowId: 'wf-1',
        workflowType: 'myWorkflow',
        runId: 'run-1'
      } );
    } );

    it( 'WORKFLOW_LOG accepts omitted metadata', () => {
      onHandlers[BusEventType.WORKFLOW_LOG]( {
        workflowDetails,
        level: 'info',
        message: 'workflow detail'
      } );

      expect( workflowLogMock.info ).toHaveBeenCalledWith( 'workflow detail', {
        workflowId: 'wf-1',
        workflowType: 'myWorkflow',
        runId: 'run-1'
      } );
    } );
  } );
} );
