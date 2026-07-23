import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApplicationFailure, CompleteAsyncError } from '@temporalio/common';
import { ActivitySpecialOutput, BusEventType, METADATA_ACCESS_SYMBOL } from '#consts';

const heartbeatMock = vi.hoisted( () => vi.fn() );
const runWithContextMock = vi.hoisted( () => vi.fn().mockImplementation( async fn => fn() ) );
const activityInfoMock = vi.hoisted( () => ( {
  workflowExecution: { workflowId: 'wf-1', runId: 'run-1' },
  activityId: 'act-1',
  activityType: 'myWorkflow#myStep',
  workflowType: 'myWorkflow'
} ) );
const traceInfoMock = vi.hoisted( () => ( {
  workflowId: 'wf-1',
  runId: 'run-1',
  workflowType: 'myWorkflow',
  startTime: 1710000000000
} ) );
const workflowDetailsMock = vi.hoisted( () => ( {
  workflowId: 'wf-1',
  runId: 'run-1',
  workflowType: 'myWorkflow',
  firstExecutionRunId: 'run-1',
  startTime: 1710000000000,
  runStartTime: 1710000000000,
  attempt: 1
} ) );

vi.mock( '@temporalio/activity', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    activityInfo: () => activityInfoMock,
    Context: {
      current: () => ( {
        info: activityInfoMock,
        heartbeat: heartbeatMock
      } )
    }
  };
} );

vi.mock( '#async_storage', () => ( {
  Storage: {
    runWithContext: runWithContextMock
  }
} ) );

const addEventStartMock = vi.fn();
const addEventEndMock = vi.fn();
const addEventErrorMock = vi.fn();
vi.mock( '#tracing', () => ( {
  addEventStart: addEventStartMock,
  addEventEnd: addEventEndMock,
  addEventError: addEventErrorMock
} ) );

vi.mock( './headers.js', () => ( {
  headersToObject: () => ( { traceInfo: traceInfoMock, workflowDetails: workflowDetailsMock } )
} ) );

const mainEventBusEmitMock = vi.fn();
vi.mock( '#bus', () => ( { mainEventBus: { emit: mainEventBusEmitMock } } ) );

vi.mock( '../configs.js', () => ( {
  get activityHeartbeatEnabled() {
    return process.env.OUTPUT_ACTIVITY_HEARTBEAT_ENABLED !== 'false';
  },
  get activityHeartbeatIntervalMs() {
    return parseInt( process.env.OUTPUT_ACTIVITY_HEARTBEAT_INTERVAL_MS || '120000', 10 );
  }
} ) );

const makeActivities = () => ( {
  'myWorkflow#myStep': { [METADATA_ACCESS_SYMBOL]: { type: 'step' } }
} );

const makeWorkflows = () => [ { name: 'myWorkflow', path: '/workflows/myWorkflow.js' } ];

const makeInput = () => ( {
  args: [ { someInput: 'data' } ],
  headers: {}
} );

describe( 'ActivityExecutionInterceptor', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    activityInfoMock.workflowType = 'myWorkflow';
    delete activityInfoMock.retryPolicy;
    vi.useFakeTimers();
    // Default: heartbeat enabled with 50ms interval for fast tests
    vi.stubEnv( 'OUTPUT_ACTIVITY_HEARTBEAT_ENABLED', 'true' );
    vi.stubEnv( 'OUTPUT_ACTIVITY_HEARTBEAT_INTERVAL_MS', '50' );
  } );

  afterEach( () => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  } );

  it( 'records trace start and end events on successful execution', async () => {
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows: makeWorkflows() } );
    const next = vi.fn().mockResolvedValue( { result: 'ok' } );

    await expect( interceptor.execute( makeInput(), next ) ).resolves.toEqual( { result: 'ok' } );
    expect( mainEventBusEmitMock ).toHaveBeenCalledWith(
      BusEventType.ACTIVITY_START,
      { activityInfo: activityInfoMock, workflowDetails: workflowDetailsMock, outputActivityKind: 'step' }
    );
    expect( mainEventBusEmitMock ).toHaveBeenCalledWith(
      BusEventType.ACTIVITY_END,
      { activityInfo: activityInfoMock, workflowDetails: workflowDetailsMock, outputActivityKind: 'step' }
    );
    expect( addEventStartMock ).toHaveBeenCalledWith( {
      id: 'act-1',
      name: 'myWorkflow#myStep',
      kind: 'step',
      parentId: 'run-1',
      details: { someInput: 'data' },
      traceInfo: traceInfoMock
    } );
    expect( addEventEndMock ).toHaveBeenCalledWith( { id: 'act-1', details: { result: 'ok' }, traceInfo: traceInfoMock } );
    expect( addEventErrorMock ).not.toHaveBeenCalled();
    expect( runWithContextMock ).toHaveBeenCalledWith(
      expect.any( Function ),
      expect.objectContaining( {
        parentId: 'act-1',
        activityInfo: activityInfoMock,
        workflowDetails: workflowDetailsMock,
        outputActivityKind: 'step',
        workflowFilename: '/workflows/myWorkflow.js',
        traceInfo: traceInfoMock
      } )
    );
  } );

  it( 'wraps native errors with serialized details', async () => {
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows: makeWorkflows() } );
    const error = new Error( 'step failed' );
    error.code = 'ESTEP';
    const next = vi.fn().mockRejectedValue( error );

    const thrown = await interceptor.execute( makeInput(), next ).catch( e => e );

    expect( thrown ).toBeInstanceOf( ApplicationFailure );
    expect( thrown ).toMatchObject( {
      message: 'step failed',
      type: 'Error',
      details: [ {
        error: {
          name: 'Error',
          message: 'step failed',
          code: 'ESTEP'
        }
      } ],
      cause: error,
      nonRetryable: false
    } );
    expect( mainEventBusEmitMock ).toHaveBeenCalledWith( BusEventType.ACTIVITY_ERROR, {
      activityInfo: activityInfoMock,
      workflowDetails: workflowDetailsMock,
      outputActivityKind: 'step',
      error
    } );
    expect( addEventErrorMock ).toHaveBeenCalledOnce();
    expect( addEventEndMock ).not.toHaveBeenCalled();
  } );

  it( 'marks inherited configured error types as non-retryable', async () => {
    class ValidationError extends Error {}
    class SpecificValidationError extends ValidationError {}
    activityInfoMock.retryPolicy = { nonRetryableErrorTypes: [ 'ValidationError' ] };
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows: makeWorkflows() } );
    const error = new SpecificValidationError( 'invalid input' );
    const next = vi.fn().mockRejectedValue( error );

    const thrown = await interceptor.execute( makeInput(), next ).catch( e => e );

    expect( thrown ).toMatchObject( {
      type: 'SpecificValidationError',
      nonRetryable: true,
      cause: error
    } );
  } );

  it( 'rethrows existing Temporal failures unchanged', async () => {
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows: makeWorkflows() } );
    const error = ApplicationFailure.nonRetryable( 'domain failed', 'DomainFailure', { reason: 'invalid' } );
    const next = vi.fn().mockRejectedValue( error );

    await expect( interceptor.execute( makeInput(), next ) ).rejects.toBe( error );
    expect( addEventErrorMock ).toHaveBeenCalledWith( { id: 'act-1', details: error, traceInfo: traceInfoMock } );
    expect( mainEventBusEmitMock ).toHaveBeenCalledWith( BusEventType.ACTIVITY_ERROR, {
      activityInfo: activityInfoMock,
      workflowDetails: workflowDetailsMock,
      outputActivityKind: 'step',
      error
    } );
  } );

  it( 'records async completion handoff as a trace end only', async () => {
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows: makeWorkflows() } );
    const error = new CompleteAsyncError();
    const next = vi.fn().mockRejectedValue( error );

    await expect( interceptor.execute( makeInput(), next ) ).rejects.toBe( error );
    expect( mainEventBusEmitMock ).toHaveBeenCalledWith( BusEventType.ACTIVITY_START, expect.any( Object ) );
    expect( mainEventBusEmitMock ).toHaveBeenCalledTimes( 1 );
    expect( addEventEndMock ).toHaveBeenCalledWith( {
      id: 'act-1',
      details: ActivitySpecialOutput.ASYNC_HANDOFF,
      traceInfo: traceInfoMock
    } );
    expect( addEventErrorMock ).not.toHaveBeenCalled();
  } );

  it( 'sends periodic heartbeats and stops after successful execution', async () => {
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows: makeWorkflows() } );

    const deferred = { resolve: null };
    const next = vi.fn().mockImplementation( () => new Promise( r => {
      deferred.resolve = r;
    } ) );

    const promise = interceptor.execute( makeInput(), next );

    expect( heartbeatMock ).not.toHaveBeenCalled();

    vi.advanceTimersByTime( 50 );
    expect( heartbeatMock ).toHaveBeenCalledTimes( 1 );

    vi.advanceTimersByTime( 50 );
    expect( heartbeatMock ).toHaveBeenCalledTimes( 2 );

    vi.advanceTimersByTime( 50 );
    expect( heartbeatMock ).toHaveBeenCalledTimes( 3 );

    deferred.resolve( { result: 'done' } );
    await promise;

    heartbeatMock.mockClear();
    vi.advanceTimersByTime( 500 );
    expect( heartbeatMock ).not.toHaveBeenCalled();
  } );

  it( 'clears heartbeat interval after activity fails', async () => {
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows: makeWorkflows() } );
    const next = vi.fn().mockRejectedValue( new Error( 'boom' ) );

    const promise = interceptor.execute( makeInput(), next );
    vi.advanceTimersByTime( 0 );
    await expect( promise ).rejects.toBeInstanceOf( ApplicationFailure );

    heartbeatMock.mockClear();
    vi.advanceTimersByTime( 500 );
    expect( heartbeatMock ).not.toHaveBeenCalled();
  } );

  it( 'resolves workflow alias in workflowsMap', async () => {
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const workflows = [ { name: 'myWorkflow', path: '/workflows/myWorkflow.js', aliases: [ 'myWorkflowOld' ] } ];
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows } );

    activityInfoMock.workflowType = 'myWorkflowOld';
    const next = vi.fn().mockResolvedValue( { result: 'ok' } );

    const promise = interceptor.execute( makeInput(), next );
    vi.advanceTimersByTime( 0 );
    await promise;

    expect( runWithContextMock ).toHaveBeenCalledWith(
      expect.any( Function ),
      expect.objectContaining( { workflowFilename: '/workflows/myWorkflow.js' } )
    );
  } );

  it( 'does not heartbeat when OUTPUT_ACTIVITY_HEARTBEAT_ENABLED is false', async () => {
    vi.stubEnv( 'OUTPUT_ACTIVITY_HEARTBEAT_ENABLED', 'false' );
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows: makeWorkflows() } );

    const deferred = { resolve: null };
    const next = vi.fn().mockImplementation( () => new Promise( r => {
      deferred.resolve = r;
    } ) );

    const promise = interceptor.execute( makeInput(), next );

    vi.advanceTimersByTime( 200 );
    expect( heartbeatMock ).not.toHaveBeenCalled();

    deferred.resolve( { result: 'done' } );
    await promise;
  } );
} );
