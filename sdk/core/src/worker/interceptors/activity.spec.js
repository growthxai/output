import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BusEventType, Signal } from '#consts';

const METADATA_ACCESS_SYMBOL = vi.hoisted( () => Symbol( '__metadata' ) );
const workflowHandleMock = vi.hoisted( () => ( { signal: vi.fn() } ) );
const getHandleMock = vi.hoisted( () => vi.fn( () => workflowHandleMock ) );
const clientConstructorMock = vi.hoisted( () => vi.fn() );
const allSettledWithTimeoutMock = vi.hoisted( () => vi.fn().mockResolvedValue( [] ) );
const logWarnMock = vi.hoisted( () => vi.fn() );

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

vi.mock( '@temporalio/client', () => ( {
  Client: class Client {
    constructor( options ) {
      clientConstructorMock( options );
    }

    workflow = {
      getHandle: getHandleMock
    };
  }
} ) );

vi.mock( '#async_storage', () => ( {
  Storage: {
    runWithContext: runWithContextMock
  }
} ) );

vi.mock( '#utils', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, allSettledWithTimeout: allSettledWithTimeoutMock };
} );

vi.mock( '#logger', () => ( {
  createChildLogger: () => ( { warn: logWarnMock } )
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
  },
  get enableAttributeSignalEmission() {
    return process.env.OUTPUT_ENABLE_ATTRIBUTE_SIGNAL_EMISSION === 'true';
  },
  get namespace() {
    return process.env.TEMPORAL_NAMESPACE || 'default';
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
    allSettledWithTimeoutMock.mockResolvedValue( [] );
    workflowHandleMock.signal.mockResolvedValue( undefined );
    vi.useFakeTimers();
    vi.resetModules();
    // Default: heartbeat enabled with 50ms interval for fast tests
    vi.stubEnv( 'OUTPUT_ACTIVITY_HEARTBEAT_ENABLED', 'true' );
    vi.stubEnv( 'OUTPUT_ACTIVITY_HEARTBEAT_INTERVAL_MS', '50' );
    // Default: attribute signal emission enabled so existing tests can verify signal-sending behaviour
    vi.stubEnv( 'OUTPUT_ENABLE_ATTRIBUTE_SIGNAL_EMISSION', 'true' );
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
    expect( clientConstructorMock ).toHaveBeenCalledWith( { connection: undefined, namespace: 'default' } );
    expect( runWithContextMock ).toHaveBeenCalledWith(
      expect.any( Function ),
      expect.objectContaining( {
        parentId: 'act-1',
        executionContext: { workflowId: 'wf-1' },
        workflowFilename: '/workflows/myWorkflow.js',
        sendAttributeSignal: expect.any( Function )
      } )
    );
    expect( getHandleMock ).toHaveBeenCalledWith( 'wf-1' );
  } );

  it( 'handles next returning a non-Promise value', async () => {
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows: makeWorkflows() } );
    const next = vi.fn( () => ( { result: 'sync' } ) );

    await expect( interceptor.execute( makeInput(), next ) ).resolves.toEqual( { result: 'sync' } );

    expect( allSettledWithTimeoutMock ).toHaveBeenCalledWith( [], 30_000 );
    expect( messageBusEmitMock ).toHaveBeenCalledWith( BusEventType.ACTIVITY_END, expect.any( Object ) );
    expect( addEventEndMock ).toHaveBeenCalledWith( { id: 'act-1', details: { result: 'sync' }, executionContext: { workflowId: 'wf-1' } } );
    expect( addEventErrorMock ).not.toHaveBeenCalled();
  } );

  it( 'handles signal flush timeout after successful execution', async () => {
    const timeoutError = Object.assign( new Error( 'timeout' ), { isTimeout: true } );
    allSettledWithTimeoutMock.mockRejectedValueOnce( timeoutError );
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows: makeWorkflows() } );
    const next = vi.fn().mockResolvedValue( { result: 'ok' } );

    await expect( interceptor.execute( makeInput(), next ) ).resolves.toEqual( { result: 'ok' } );

    expect( allSettledWithTimeoutMock ).toHaveBeenCalledWith( [], 30_000 );
    expect( logWarnMock ).toHaveBeenCalledWith(
      'Some usage/cost attributes were missed because not all activity signals were sent to the workflow',
      { workflowId: 'wf-1', workflowName: 'myWorkflow', activityId: 'act-1', activityName: 'myWorkflow#myStep' }
    );
    expect( messageBusEmitMock ).toHaveBeenCalledWith( BusEventType.ACTIVITY_END, expect.any( Object ) );
    expect( addEventEndMock ).toHaveBeenCalledOnce();
    expect( addEventErrorMock ).not.toHaveBeenCalled();
  } );

  it( 'handles signal flush timeout after failed execution', async () => {
    const timeoutError = Object.assign( new Error( 'timeout' ), { isTimeout: true } );
    allSettledWithTimeoutMock.mockRejectedValueOnce( timeoutError );
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows: makeWorkflows() } );
    const error = new Error( 'step failed' );
    const next = vi.fn().mockRejectedValue( error );

    await expect( interceptor.execute( makeInput(), next ) ).rejects.toThrow( 'step failed' );

    expect( allSettledWithTimeoutMock ).toHaveBeenCalledWith( [], 30_000 );
    expect( logWarnMock ).toHaveBeenCalledWith(
      'Some usage/cost attributes were missed because not all activity signals were sent to the workflow',
      { workflowId: 'wf-1', workflowName: 'myWorkflow', activityId: 'act-1', activityName: 'myWorkflow#myStep' }
    );
    expect( messageBusEmitMock ).toHaveBeenCalledWith( BusEventType.ACTIVITY_ERROR, expect.objectContaining( { error } ) );
    expect( addEventErrorMock ).toHaveBeenCalledOnce();
    expect( addEventEndMock ).not.toHaveBeenCalled();
  } );

  it( 'exposes sendAttributeSignal in activity context', async () => {
    const attribute = { setActivity: vi.fn() };
    runWithContextMock.mockImplementationOnce( async ( fn, ctx ) => {
      ctx.sendAttributeSignal( attribute );
      return fn();
    } );
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows: makeWorkflows() } );
    const next = vi.fn().mockResolvedValue( { result: 'ok' } );

    await expect( interceptor.execute( makeInput(), next ) ).resolves.toEqual( { result: 'ok' } );

    expect( attribute.setActivity ).toHaveBeenCalledWith( 'act-1', 'myWorkflow#myStep' );
    expect( workflowHandleMock.signal ).toHaveBeenCalledWith( Signal.ADD_ATTRIBUTE, attribute );
    expect( allSettledWithTimeoutMock ).toHaveBeenCalledWith( [ expect.any( Promise ) ], 30_000 );
  } );

  it( 'does not signal when OUTPUT_ENABLE_ATTRIBUTE_SIGNAL_EMISSION is false', async () => {
    vi.stubEnv( 'OUTPUT_ENABLE_ATTRIBUTE_SIGNAL_EMISSION', 'false' );
    const attribute = { setActivity: vi.fn() };
    runWithContextMock.mockImplementationOnce( async ( fn, ctx ) => {
      ctx.sendAttributeSignal( attribute );
      return fn();
    } );
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows: makeWorkflows() } );
    const next = vi.fn().mockResolvedValue( { result: 'ok' } );

    await expect( interceptor.execute( makeInput(), next ) ).resolves.toEqual( { result: 'ok' } );

    expect( attribute.setActivity ).not.toHaveBeenCalled();
    expect( workflowHandleMock.signal ).not.toHaveBeenCalled();
    expect( allSettledWithTimeoutMock ).toHaveBeenCalledWith( [], 30_000 );
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

  it( 'resolves workflow alias in workflowsMap', async () => {
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const workflows = [ { name: 'myWorkflow', path: '/workflows/myWorkflow.js', aliases: [ 'myWorkflowOld' ] } ];
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows } );

    // Override context to use alias as workflowType
    contextInfoMock.workflowType = 'myWorkflowOld';
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
    contextInfoMock.workflowType = 'myWorkflow';
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
