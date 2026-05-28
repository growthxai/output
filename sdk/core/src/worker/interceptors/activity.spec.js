import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ACTIVITY_WRAPPER_VERSION_FIELD, BusEventType, Signal } from '#consts';
import { Attribute } from '#trace_attribute';

const METADATA_ACCESS_SYMBOL = vi.hoisted( () => Symbol( '__metadata' ) );
const workflowHandleMock = vi.hoisted( () => ( { signal: vi.fn() } ) );
const getHandleMock = vi.hoisted( () => vi.fn( () => workflowHandleMock ) );
const clientConstructorMock = vi.hoisted( () => vi.fn() );
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

const emptyAggregations = {
  cost: { total: 0 },
  tokens: { total: 0 },
  httpRequests: { total: 0 }
};

const httpRequestAttribute = {
  type: Attribute.HTTPRequestCount.TYPE,
  url: 'https://api.example.test/items',
  requestId: 'req-1'
};

describe( 'ActivityExecutionInterceptor', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    workflowHandleMock.signal.mockResolvedValue( undefined );
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
      aggregations: emptyAggregations,
      [ACTIVITY_WRAPPER_VERSION_FIELD]: 1
    } );
    expect( messageBusEmitMock ).toHaveBeenCalledWith( BusEventType.ACTIVITY_START, expect.objectContaining( {
      id: 'act-1', name: 'myWorkflow#myStep', kind: 'step', workflowId: 'wf-1', workflowName: 'myWorkflow'
    } ) );
    expect( messageBusEmitMock ).toHaveBeenCalledWith( BusEventType.ACTIVITY_END, expect.objectContaining( {
      id: 'act-1', name: 'myWorkflow#myStep', kind: 'step', workflowId: 'wf-1', workflowName: 'myWorkflow', duration: expect.any( Number )
    } ) );
    expect( addEventStartMock ).toHaveBeenCalledOnce();
    expect( addEventEndMock ).toHaveBeenCalledOnce();
    expect( addEventErrorMock ).not.toHaveBeenCalled();
    expect( clientConstructorMock ).not.toHaveBeenCalled();
    expect( runWithContextMock ).toHaveBeenCalledWith(
      expect.any( Function ),
      expect.objectContaining( {
        parentId: 'act-1',
        executionContext: { workflowId: 'wf-1' },
        workflowFilename: '/workflows/myWorkflow.js',
        addAttribute: expect.any( Function )
      } )
    );
    expect( getHandleMock ).not.toHaveBeenCalled();
  } );

  it( 'handles next returning a non-Promise value', async () => {
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows: makeWorkflows() } );
    const next = vi.fn( () => ( { result: 'sync' } ) );

    await expect( interceptor.execute( makeInput(), next ) ).resolves.toEqual( {
      output: { result: 'sync' },
      aggregations: emptyAggregations,
      [ACTIVITY_WRAPPER_VERSION_FIELD]: 1
    } );

    expect( messageBusEmitMock ).toHaveBeenCalledWith( BusEventType.ACTIVITY_END, expect.any( Object ) );
    expect( addEventEndMock ).toHaveBeenCalledWith( { id: 'act-1', details: { result: 'sync' }, executionContext: { workflowId: 'wf-1' } } );
    expect( addEventErrorMock ).not.toHaveBeenCalled();
  } );

  it( 'does not signal collected attributes after successful execution', async () => {
    runWithContextMock.mockImplementationOnce( async ( fn, ctx ) => {
      ctx.addAttribute( httpRequestAttribute );
      return fn();
    } );
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows: makeWorkflows() } );
    const next = vi.fn().mockResolvedValue( { result: 'ok' } );

    await expect( interceptor.execute( makeInput(), next ) ).resolves.toEqual( {
      output: { result: 'ok' },
      aggregations: {
        cost: { total: 0 },
        tokens: { total: 0 },
        httpRequests: { total: 1 }
      },
      [ACTIVITY_WRAPPER_VERSION_FIELD]: 1
    } );

    expect( workflowHandleMock.signal ).not.toHaveBeenCalled();
    expect( clientConstructorMock ).not.toHaveBeenCalled();
  } );

  it( 'signals collected aggregations after failed execution', async () => {
    runWithContextMock.mockImplementationOnce( async ( fn, ctx ) => {
      ctx.addAttribute( httpRequestAttribute );
      return fn();
    } );
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows: makeWorkflows() } );
    const error = new Error( 'step failed' );
    const next = vi.fn().mockRejectedValue( error );

    await expect( interceptor.execute( makeInput(), next ) ).rejects.toThrow( 'step failed' );

    expect( clientConstructorMock ).toHaveBeenCalledWith( { connection: undefined, namespace: 'default' } );
    expect( getHandleMock ).toHaveBeenCalledWith( 'wf-1' );
    expect( workflowHandleMock.signal ).toHaveBeenCalledWith( Signal.SEND_AGGREGATIONS, {
      cost: { total: 0 },
      tokens: { total: 0 },
      httpRequests: { total: 1 }
    } );
    expect( messageBusEmitMock ).toHaveBeenCalledWith( BusEventType.ACTIVITY_ERROR, expect.objectContaining( { error } ) );
    expect( addEventErrorMock ).toHaveBeenCalledOnce();
    expect( addEventEndMock ).not.toHaveBeenCalled();
  } );

  it( 'does not send fallback signal when failed execution collected no attributes', async () => {
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows: makeWorkflows() } );
    const next = vi.fn().mockRejectedValue( new Error( 'step failed' ) );

    await expect( interceptor.execute( makeInput(), next ) ).rejects.toThrow( 'step failed' );

    expect( workflowHandleMock.signal ).not.toHaveBeenCalled();
    expect( clientConstructorMock ).not.toHaveBeenCalled();
  } );

  it( 'logs when fallback attribute signal fails', async () => {
    const signalError = new Error( 'signal failed' );
    workflowHandleMock.signal.mockRejectedValueOnce( signalError );
    runWithContextMock.mockImplementationOnce( async ( fn, ctx ) => {
      ctx.addAttribute( httpRequestAttribute );
      return fn();
    } );
    const { ActivityExecutionInterceptor } = await import( './activity.js' );
    const interceptor = new ActivityExecutionInterceptor( { activities: makeActivities(), workflows: makeWorkflows() } );
    const next = vi.fn().mockRejectedValue( new Error( 'step failed' ) );

    await expect( interceptor.execute( makeInput(), next ) ).rejects.toThrow( 'step failed' );

    expect( logWarnMock ).toHaveBeenCalledWith( `Signal "${Signal.SEND_AGGREGATIONS}" failed`, expect.objectContaining( {
      message: 'signal failed',
      activityId: 'act-1',
      activityName: 'myWorkflow#myStep',
      workflowId: 'wf-1',
      workflowName: 'myWorkflow'
    } ) );
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
