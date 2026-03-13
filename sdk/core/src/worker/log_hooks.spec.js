import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BusEventType,
  ComponentType,
  LifecycleEvent,
  WORKFLOW_CATALOG
} from '#consts';

const activityLogMock = vi.hoisted( () => ( { info: vi.fn(), error: vi.fn() } ) );
const workflowLogMock = vi.hoisted( () => ( { info: vi.fn(), error: vi.fn() } ) );
const createChildLoggerMock = vi.hoisted( () =>
  vi.fn( name => ( name === 'Activity' ? activityLogMock : workflowLogMock ) )
);

const onHandlers = vi.hoisted( () => ( {} ) );
const messageBusMock = vi.hoisted( () => ( {
  on: vi.fn( ( eventType, handler ) => {
    onHandlers[eventType] = handler;
  } )
} ) );

vi.mock( '#logger', () => ( { createChildLogger: createChildLoggerMock } ) );
vi.mock( '#bus', () => ( { messageBus: messageBusMock } ) );

import './log_hooks.js';

describe( 'log_hooks', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  describe( 'activity events', () => {
    const basePayload = {
      id: 'act-1',
      name: 'myWorkflow#myStep',
      kind: 'step',
      workflowId: 'wf-1',
      workflowName: 'myWorkflow'
    };

    it( 'ACTIVITY_START logs full message and second arg', () => {
      onHandlers[BusEventType.ACTIVITY_START]( basePayload );

      expect( activityLogMock.info ).toHaveBeenCalledTimes( 1 );
      expect( activityLogMock.info ).toHaveBeenCalledWith(
        'Started myWorkflow#myStep step',
        {
          event: LifecycleEvent.START,
          activityId: 'act-1',
          activityName: 'myWorkflow#myStep',
          activityKind: 'step',
          workflowId: 'wf-1',
          workflowName: 'myWorkflow'
        }
      );
    } );

    it( 'ACTIVITY_START does not log when kind is INTERNAL_STEP', () => {
      onHandlers[BusEventType.ACTIVITY_START]( {
        ...basePayload,
        kind: ComponentType.INTERNAL_STEP
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
          activityName: 'myWorkflow#myStep',
          activityKind: 'step',
          workflowId: 'wf-1',
          workflowName: 'myWorkflow',
          durationMs: 42
        }
      );
    } );

    it( 'ACTIVITY_END does not log when kind is INTERNAL_STEP', () => {
      onHandlers[BusEventType.ACTIVITY_END]( {
        ...basePayload,
        kind: ComponentType.INTERNAL_STEP,
        duration: 10
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
          activityName: 'myWorkflow#myStep',
          activityKind: 'step',
          workflowId: 'wf-1',
          workflowName: 'myWorkflow',
          durationMs: 100,
          error: 'step failed'
        }
      );
    } );

    it( 'ACTIVITY_ERROR does not log when kind is INTERNAL_STEP', () => {
      onHandlers[BusEventType.ACTIVITY_ERROR]( {
        ...basePayload,
        kind: ComponentType.INTERNAL_STEP,
        duration: 5,
        error: new Error( 'x' )
      } );

      expect( activityLogMock.error ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'workflow events', () => {
    const basePayload = { id: 'wf-1', name: 'myWorkflow' };

    it( 'WORKFLOW_START logs full message and second arg', () => {
      onHandlers[BusEventType.WORKFLOW_START]( basePayload );

      expect( workflowLogMock.info ).toHaveBeenCalledTimes( 1 );
      expect( workflowLogMock.info ).toHaveBeenCalledWith(
        'Started myWorkflow workflow',
        {
          event: LifecycleEvent.START,
          workflowId: 'wf-1',
          workflowName: 'myWorkflow'
        }
      );
    } );

    it( 'WORKFLOW_START does not log when name is WORKFLOW_CATALOG', () => {
      onHandlers[BusEventType.WORKFLOW_START]( {
        id: 'cat-1',
        name: WORKFLOW_CATALOG
      } );

      expect( workflowLogMock.info ).not.toHaveBeenCalled();
    } );

    it( 'WORKFLOW_END logs full message and second arg', () => {
      onHandlers[BusEventType.WORKFLOW_END]( {
        ...basePayload,
        duration: 200
      } );

      expect( workflowLogMock.info ).toHaveBeenCalledTimes( 1 );
      expect( workflowLogMock.info ).toHaveBeenCalledWith(
        'Ended myWorkflow workflow',
        {
          event: LifecycleEvent.END,
          workflowId: 'wf-1',
          workflowName: 'myWorkflow',
          durationMs: 200
        }
      );
    } );

    it( 'WORKFLOW_END does not log when name is WORKFLOW_CATALOG', () => {
      onHandlers[BusEventType.WORKFLOW_END]( {
        id: 'cat-1',
        name: WORKFLOW_CATALOG,
        duration: 50
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
          workflowName: 'myWorkflow',
          durationMs: 150,
          error: 'workflow boom'
        }
      );
    } );

    it( 'WORKFLOW_ERROR does not log when name is WORKFLOW_CATALOG', () => {
      onHandlers[BusEventType.WORKFLOW_ERROR]( {
        id: 'cat-1',
        name: WORKFLOW_CATALOG,
        duration: 1,
        error: new Error( 'x' )
      } );

      expect( workflowLogMock.error ).not.toHaveBeenCalled();
    } );
  } );
} );
