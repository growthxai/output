import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApplicationFailure } from '@temporalio/common';
import { ACTIVITY_WRAPPER_VERSION_FIELD, BusEventType } from '#consts';
import { Attribute } from '#trace_attribute';

const METADATA_ACCESS_SYMBOL = vi.hoisted( () => Symbol( '__metadata' ) );
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

vi.mock( '#consts', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual, get METADATA_ACCESS_SYMBOL() {
      return METADATA_ACCESS_SYMBOL;
    }
  };
} );

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

const httpRequestAttribute = {
  type: Attribute.HTTPRequestCount.TYPE,
  url: 'https://api.example.test/items',
  requestId: 'req-1'
};

const httpRequestAggregations = {
  cost: { total: 0 },
  tokens: { total: 0 },
  httpRequests: { total: 1 }
};

describe( 'ActivityExecutionInterceptor', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    activityInfoMock.workflowType = 'myWorkflow';
    vi.useFakeTimers();
    vi.resetModules();
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

    const promise = interceptor.execute( makeInput(), next );
    vi.advanceTimersByTime( 0 );
    const output = await promise;

    expect( output ).toEqual( {
      output: { result: 'ok' },
      aggregations: null,
      [ACTIVITY_WRAPPER_VERSION_FIELD]: 1
    } );
    expect( mainEventBusEmitMock ).toHaveBeenCalledWith(
      BusEventType.ACTIVITY_START,
      { activityInfo: activityInfoMock, workflowDetails: workflowDetailsMock, outputActivityKind: 'step' }
    );
    expect( mainEventBusEmitMock ).toHaveBeenCalledWith(
      BusEventType.ACTIVITY_END,
      { activityInfo: activityInfoMock, aggregations: null, workflowDetails: workflowDetailsMock, outputActivityKind: 'step' }
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
        traceInfo: traceInfoMock,
        addAttribute: expect.any( Function )
      } )
    );
  } );

  it( 'handles next returning a non-Promise value', async () => {
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows: makeWorkflows() } );
    const next = vi.fn( () => ( { result: 'sync' } ) );

    await expect( interceptor.execute( makeInput(), next ) ).resolves.toEqual( {
      output: { result: 'sync' },
      aggregations: null,
      [ACTIVITY_WRAPPER_VERSION_FIELD]: 1
    } );

    expect( mainEventBusEmitMock ).toHaveBeenCalledWith( BusEventType.ACTIVITY_END, expect.any( Object ) );
    expect( addEventEndMock ).toHaveBeenCalledWith( { id: 'act-1', details: { result: 'sync' }, traceInfo: traceInfoMock } );
    expect( addEventErrorMock ).not.toHaveBeenCalled();
  } );

  it( 'returns collected aggregations after successful execution', async () => {
    runWithContextMock.mockImplementationOnce( async ( fn, ctx ) => {
      ctx.addAttribute( httpRequestAttribute );
      return fn();
    } );
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows: makeWorkflows() } );
    const next = vi.fn().mockResolvedValue( { result: 'ok' } );

    await expect( interceptor.execute( makeInput(), next ) ).resolves.toEqual( {
      output: { result: 'ok' },
      aggregations: httpRequestAggregations,
      [ACTIVITY_WRAPPER_VERSION_FIELD]: 1
    } );

    expect( mainEventBusEmitMock ).toHaveBeenCalledWith( BusEventType.ACTIVITY_END, {
      activityInfo: activityInfoMock,
      aggregations: httpRequestAggregations,
      workflowDetails: workflowDetailsMock,
      outputActivityKind: 'step'
    } );
  } );

  it( 'stores collected aggregations in ApplicationFailure details after failed execution', async () => {
    runWithContextMock.mockImplementationOnce( async ( fn, ctx ) => {
      ctx.addAttribute( httpRequestAttribute );
      return fn();
    } );
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows: makeWorkflows() } );
    const error = new Error( 'step failed' );
    const next = vi.fn().mockRejectedValue( error );

    const thrown = await interceptor.execute( makeInput(), next ).catch( e => e );
    expect( thrown ).toBeInstanceOf( ApplicationFailure );
    expect( thrown ).toMatchObject( {
      message: 'step failed',
      type: 'Error',
      details: [ {
        aggregations: httpRequestAggregations
      } ],
      cause: error
    } );
    expect( mainEventBusEmitMock ).toHaveBeenCalledWith( BusEventType.ACTIVITY_ERROR, {
      activityInfo: activityInfoMock,
      aggregations: httpRequestAggregations,
      workflowDetails: workflowDetailsMock,
      outputActivityKind: 'step',
      error
    } );
    expect( addEventErrorMock ).toHaveBeenCalledOnce();
    expect( addEventEndMock ).not.toHaveBeenCalled();
  } );

  it( 'appends collected aggregations to existing failure details', async () => {
    runWithContextMock.mockImplementationOnce( async ( fn, ctx ) => {
      ctx.addAttribute( httpRequestAttribute );
      return fn();
    } );
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows: makeWorkflows() } );
    const error = new Error( 'step failed' );
    error.details = [ { domain: { reason: 'bad-input' } } ];
    const next = vi.fn().mockRejectedValue( error );

    const thrown = await interceptor.execute( makeInput(), next ).catch( e => e );

    expect( thrown.details ).toEqual( [
      { domain: { reason: 'bad-input' } },
      { aggregations: httpRequestAggregations }
    ] );
  } );

  it( 'rethrows the original error when failed execution collected no attributes', async () => {
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows: makeWorkflows() } );
    const error = new Error( 'step failed' );
    const next = vi.fn().mockRejectedValue( error );

    await expect( interceptor.execute( makeInput(), next ) ).rejects.toBe( error );
  } );

  it( 'rethrows the original error with existing details when failed execution collected no attributes', async () => {
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows: makeWorkflows() } );
    const error = new Error( 'step failed' );
    error.details = [ { domain: { reason: 'bad-input' } } ];
    const next = vi.fn().mockRejectedValue( error );

    await expect( interceptor.execute( makeInput(), next ) ).rejects.toBe( error );
    expect( error.details ).toEqual( [ { domain: { reason: 'bad-input' } } ] );
  } );

  it( 'wraps existing ApplicationFailure without creating a self-cause', async () => {
    runWithContextMock.mockImplementationOnce( async ( fn, ctx ) => {
      ctx.addAttribute( httpRequestAttribute );
      return fn();
    } );
    const error = ApplicationFailure.create( {
      message: 'application failed',
      type: 'OriginalType',
      nonRetryable: true,
      details: [ { domain: { reason: 'bad-input' } } ]
    } );
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows: makeWorkflows() } );
    const next = vi.fn().mockRejectedValue( error );

    const thrown = await interceptor.execute( makeInput(), next ).catch( e => e );

    expect( thrown ).toBeInstanceOf( ApplicationFailure );
    expect( thrown ).not.toBe( error );
    expect( thrown.cause ).toBe( error );
    expect( thrown.cause ).not.toBe( thrown );
    expect( thrown ).toMatchObject( {
      message: 'application failed',
      type: 'OriginalType',
      nonRetryable: true,
      details: [
        { domain: { reason: 'bad-input' } },
        { aggregations: httpRequestAggregations }
      ]
    } );
  } );

  it( 'records trace error event on failed execution', async () => {
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows: makeWorkflows() } );
    const error = new Error( 'step failed' );
    const next = vi.fn().mockRejectedValue( error );

    const promise = interceptor.execute( makeInput(), next );
    vi.advanceTimersByTime( 0 );

    await expect( promise ).rejects.toThrow( 'step failed' );
    expect( mainEventBusEmitMock ).toHaveBeenCalledWith( BusEventType.ACTIVITY_START, expect.any( Object ) );
    expect( mainEventBusEmitMock ).toHaveBeenCalledWith( BusEventType.ACTIVITY_ERROR, {
      activityInfo: activityInfoMock,
      aggregations: null,
      workflowDetails: workflowDetailsMock,
      outputActivityKind: 'step',
      error
    } );
    expect( addEventStartMock ).toHaveBeenCalledOnce();
    expect( addEventErrorMock ).toHaveBeenCalledWith( { id: 'act-1', details: error, traceInfo: traceInfoMock } );
    expect( addEventEndMock ).not.toHaveBeenCalled();
  } );

  it( 'sends periodic heartbeats during activity execution', async () => {
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows: makeWorkflows() } );

    // next() resolves only after we manually resolve it, simulating a long-running activity
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
  } );

  it( 'clears heartbeat interval after activity completes', async () => {
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows: makeWorkflows() } );
    const next = vi.fn().mockResolvedValue( { result: 'ok' } );

    const promise = interceptor.execute( makeInput(), next );
    vi.advanceTimersByTime( 0 );
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
    await promise.catch( () => {} );

    heartbeatMock.mockClear();
    vi.advanceTimersByTime( 500 );
    expect( heartbeatMock ).not.toHaveBeenCalled();
  } );

  it( 'resolves workflow alias in workflowsMap', async () => {
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const workflows = [ { name: 'myWorkflow', path: '/workflows/myWorkflow.js', aliases: [ 'myWorkflowOld' ] } ];
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows } );

    // Override context to use alias as workflowType
    activityInfoMock.workflowType = 'myWorkflowOld';
    const next = vi.fn().mockResolvedValue( { result: 'ok' } );

    const promise = interceptor.execute( makeInput(), next );
    vi.advanceTimersByTime( 0 );
    await promise;

    // Should resolve to the correct path despite using the alias
    expect( runWithContextMock ).toHaveBeenCalledWith(
      expect.any( Function ),
      expect.objectContaining( { workflowFilename: '/workflows/myWorkflow.js' } )
    );

    // Restore for other tests
    activityInfoMock.workflowType = 'myWorkflow';
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
