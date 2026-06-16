import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StepNotFoundError, StepNotCompletedError } from '../../errors.js';
import { EventType } from '../../event_types.js';

const { mockBuildWorkflowId } = vi.hoisted( () => ( {
  mockBuildWorkflowId: vi.fn()
} ) );

vi.mock( '#configs', () => ( {
  temporal: { namespace: 'default' }
} ) );

vi.mock( '#utils', () => ( {
  buildWorkflowId: mockBuildWorkflowId
} ) );

const event = ( eventId, eventType, attrs = {} ) => ( {
  eventId: { toString: () => String( eventId ) },
  eventType,
  ...attrs
} );

const validEvents = () => [
  event( 1, EventType.WORKFLOW_EXECUTION_STARTED ),
  event( 2, EventType.WORKFLOW_TASK_SCHEDULED ),
  event( 3, EventType.WORKFLOW_TASK_STARTED ),
  event( 4, EventType.WORKFLOW_TASK_COMPLETED ),
  event( 5, EventType.ACTIVITY_TASK_SCHEDULED, {
    activityTaskScheduledEventAttributes: { activityType: { name: 'workflow#firstStep' } }
  } ),
  event( 6, EventType.ACTIVITY_TASK_STARTED ),
  event( 7, EventType.ACTIVITY_TASK_COMPLETED, {
    activityTaskCompletedEventAttributes: { scheduledEventId: { toString: () => '5' } }
  } ),
  event( 8, EventType.WORKFLOW_TASK_SCHEDULED ),
  event( 9, EventType.WORKFLOW_TASK_STARTED ),
  event( 10, EventType.WORKFLOW_TASK_COMPLETED )
];

describe( 'resolveResetEventId', () => {
  it( 'returns the workflow task completed event after the matched activity completes', async () => {
    const { resolveResetEventId } = await import( './reset.js' );

    expect( resolveResetEventId( validEvents(), 'firstStep' ).toString() ).toBe( '10' );
  } );

  it( 'uses the last occurrence when a step appears more than once', async () => {
    const events = [
      ...validEvents(),
      event( 11, EventType.ACTIVITY_TASK_SCHEDULED, {
        activityTaskScheduledEventAttributes: { activityType: { name: 'workflow#firstStep' } }
      } ),
      event( 12, EventType.ACTIVITY_TASK_COMPLETED, {
        activityTaskCompletedEventAttributes: { scheduledEventId: { toString: () => '11' } }
      } ),
      event( 13, EventType.WORKFLOW_TASK_COMPLETED )
    ];
    const { resolveResetEventId } = await import( './reset.js' );

    expect( resolveResetEventId( events, 'firstStep' ).toString() ).toBe( '13' );
  } );

  it( 'matches shared-step activity names by suffix', async () => {
    const events = [
      event( 1, EventType.ACTIVITY_TASK_SCHEDULED, {
        activityTaskScheduledEventAttributes: { activityType: { name: '$shared#commonStep' } }
      } ),
      event( 2, EventType.ACTIVITY_TASK_COMPLETED, {
        activityTaskCompletedEventAttributes: { scheduledEventId: { toString: () => '1' } }
      } ),
      event( 3, EventType.WORKFLOW_TASK_COMPLETED )
    ];
    const { resolveResetEventId } = await import( './reset.js' );

    expect( resolveResetEventId( events, 'commonStep' ).toString() ).toBe( '3' );
  } );

  it( 'throws StepNotFoundError when the step was never scheduled', async () => {
    const { resolveResetEventId } = await import( './reset.js' );

    expect( () => resolveResetEventId( validEvents(), 'missingStep' ) ).toThrow( StepNotFoundError );
  } );

  it( 'throws StepNotCompletedError when the scheduled activity did not complete', async () => {
    const events = [
      event( 1, EventType.ACTIVITY_TASK_SCHEDULED, {
        activityTaskScheduledEventAttributes: { activityType: { name: 'workflow#incompleteStep' } }
      } )
    ];
    const { resolveResetEventId } = await import( './reset.js' );

    expect( () => resolveResetEventId( events, 'incompleteStep' ) ).toThrow( StepNotCompletedError );
  } );

  it( 'throws StepNotCompletedError when no workflow task completed after the activity', async () => {
    const events = [
      event( 1, EventType.ACTIVITY_TASK_SCHEDULED, {
        activityTaskScheduledEventAttributes: { activityType: { name: 'workflow#step' } }
      } ),
      event( 2, EventType.ACTIVITY_TASK_COMPLETED, {
        activityTaskCompletedEventAttributes: { scheduledEventId: { toString: () => '1' } }
      } )
    ];
    const { resolveResetEventId } = await import( './reset.js' );

    expect( () => resolveResetEventId( events, 'step' ) ).toThrow( StepNotCompletedError );
  } );
} );

describe( 'reset', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    mockBuildWorkflowId.mockReturnValue( 'request-id' );
  } );

  it( 'resolves and pins the latest run before fetching history and resetting', async () => {
    const describe = vi.fn().mockResolvedValue( { runId: 'resolved-run' } );
    const latestHandle = { describe };
    const pinnedHandle = { fetchHistory: vi.fn().mockResolvedValue( { events: validEvents() } ) };
    const getHandle = vi.fn()
      .mockReturnValueOnce( latestHandle )
      .mockReturnValueOnce( pinnedHandle );
    const resetWorkflowExecution = vi.fn().mockResolvedValue( { runId: 'new-run' } );
    const client = { workflow: { getHandle } };
    const connection = { workflowService: { resetWorkflowExecution } };
    const { reset } = await import( './reset.js' );

    const result = await reset( { client, connection }, 'workflow-id', 'firstStep', 'retry it' );

    expect( getHandle ).toHaveBeenNthCalledWith( 1, 'workflow-id', undefined );
    expect( getHandle ).toHaveBeenNthCalledWith( 2, 'workflow-id', 'resolved-run' );
    expect( describe.mock.invocationCallOrder[0] ).toBeLessThan( pinnedHandle.fetchHistory.mock.invocationCallOrder[0] );
    expect( resetWorkflowExecution ).toHaveBeenCalledWith( {
      namespace: 'default',
      workflowExecution: { workflowId: 'workflow-id', runId: 'resolved-run' },
      reason: 'retry it',
      workflowTaskFinishEventId: expect.objectContaining( { toString: expect.any( Function ) } ),
      requestId: 'request-id'
    } );
    expect( resetWorkflowExecution.mock.calls[0][0].workflowTaskFinishEventId.toString() ).toBe( '10' );
    expect( result ).toEqual( { workflowId: 'workflow-id', runId: 'new-run' } );
  } );

  it( 'uses a caller-provided runId without describing or re-pinning', async () => {
    const handle = { describe: vi.fn(), fetchHistory: vi.fn().mockResolvedValue( { events: validEvents() } ) };
    const getHandle = vi.fn().mockReturnValue( handle );
    const resetWorkflowExecution = vi.fn().mockResolvedValue( { runId: 'new-run' } );
    const client = { workflow: { getHandle } };
    const connection = { workflowService: { resetWorkflowExecution } };
    const { reset } = await import( './reset.js' );

    await reset( { client, connection }, 'workflow-id', 'firstStep', undefined, 'pinned-run' );

    expect( getHandle ).toHaveBeenCalledTimes( 1 );
    expect( getHandle ).toHaveBeenCalledWith( 'workflow-id', 'pinned-run' );
    expect( handle.describe ).not.toHaveBeenCalled();
    expect( resetWorkflowExecution ).toHaveBeenCalledWith( expect.objectContaining( {
      workflowExecution: { workflowId: 'workflow-id', runId: 'pinned-run' },
      reason: 'Reset to re-run from after step "firstStep"'
    } ) );
  } );

  it( 'throws before fetching history when latest-run describe has no runId', async () => {
    const latestHandle = { describe: vi.fn().mockResolvedValue( {} ) };
    const getHandle = vi.fn().mockReturnValue( latestHandle );
    const resetWorkflowExecution = vi.fn();
    const client = { workflow: { getHandle } };
    const connection = { workflowService: { resetWorkflowExecution } };
    const { reset } = await import( './reset.js' );

    await expect( reset( { client, connection }, 'workflow-id', 'firstStep' ) ).rejects.toThrow( /did not report a runId/ );
    expect( resetWorkflowExecution ).not.toHaveBeenCalled();
  } );
} );
