import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BusEventType } from '#consts';

const METADATA_ACCESS_SYMBOL = vi.hoisted( () => Symbol( '__metadata' ) );

const heartbeatMock = vi.fn();
const runWithContextMock = vi.hoisted( () => vi.fn().mockImplementation( async fn => fn() ) );
const contextInfoMock = {
  workflowExecution: { workflowId: 'wf-1' },
  activityId: 'act-1',
  activityType: 'myWorkflow#myStep',
  workflowType: 'myWorkflow'
};

vi.mock( '@temporalio/activity', () => ( {
  Context: {
    current: () => ( {
      info: contextInfoMock,
      heartbeat: heartbeatMock
    } )
  }
} ) );

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

vi.mock( '../sandboxed_utils.js', () => ( {
  headersToObject: () => ( { executionContext: { workflowId: 'wf-1' } } )
} ) );

const messageBusEmitMock = vi.fn();
vi.mock( '#bus', () => ( { messageBus: { emit: messageBusEmitMock } } ) );

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

describe( 'ActivityExecutionInterceptor', () => {
  beforeEach( () => {
    vi.clearAllMocks();
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

    expect( output ).toEqual( { result: 'ok' } );
    expect( messageBusEmitMock ).toHaveBeenCalledWith( BusEventType.ACTIVITY_START, expect.objectContaining( {
      id: 'act-1', name: 'myWorkflow#myStep', kind: 'step', workflowId: 'wf-1', workflowName: 'myWorkflow'
    } ) );
    expect( messageBusEmitMock ).toHaveBeenCalledWith( BusEventType.ACTIVITY_END, expect.objectContaining( {
      id: 'act-1', name: 'myWorkflow#myStep', kind: 'step', workflowId: 'wf-1', workflowName: 'myWorkflow', duration: expect.any( Number )
    } ) );
    expect( addEventStartMock ).toHaveBeenCalledOnce();
    expect( addEventEndMock ).toHaveBeenCalledOnce();
    expect( addEventErrorMock ).not.toHaveBeenCalled();
    expect( runWithContextMock ).toHaveBeenCalledWith(
      expect.any( Function ),
      {
        parentId: 'act-1',
        executionContext: { workflowId: 'wf-1' },
        workflowFilename: '/workflows/myWorkflow.js'
      }
    );
  } );

  it( 'records trace error event on failed execution', async () => {
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows: makeWorkflows() } );
    const error = new Error( 'step failed' );
    const next = vi.fn().mockRejectedValue( error );

    const promise = interceptor.execute( makeInput(), next );
    vi.advanceTimersByTime( 0 );

    await expect( promise ).rejects.toThrow( 'step failed' );
    expect( messageBusEmitMock ).toHaveBeenCalledWith( BusEventType.ACTIVITY_START, expect.any( Object ) );
    expect( messageBusEmitMock ).toHaveBeenCalledWith( BusEventType.ACTIVITY_ERROR, expect.objectContaining( {
      id: 'act-1', name: 'myWorkflow#myStep', kind: 'step', workflowId: 'wf-1', workflowName: 'myWorkflow',
      duration: expect.any( Number ), error: expect.any( Error )
    } ) );
    expect( addEventStartMock ).toHaveBeenCalledOnce();
    expect( addEventErrorMock ).toHaveBeenCalledOnce();
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
