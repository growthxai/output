import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  catalogJobInstance,
  bindGlobalFunctionsMock,
  configValues,
  connectionMonitorInstance,
  createCatalogMock,
  initInterceptorsMock,
  mainEventBusMock,
  mockConnection,
  mockLog,
  mockWorker,
  promises,
  resetPromises,
  setupClientConfigMock,
  setupInterruptionHandlerMock,
  setupTelemetryMock
} = vi.hoisted( () => {
  const createDeferred = () => {
    const state = {};
    state.promise = new Promise( ( resolve, reject ) => {
      state.resolve = resolve;
      state.reject = reject;
    } );
    return state;
  };

  const promises = {};
  const resetPromises = () => {
    promises.workerRun = createDeferred();
    promises.connectionMonitor = createDeferred();
    promises.catalogJob = createDeferred();
  };
  resetPromises();

  const configValues = {
    address: 'localhost:7233',
    apiKey: undefined,
    namespace: 'default',
    taskQueue: 'test-queue',
    catalogId: 'test-catalog',
    grpcProxy: undefined,
    maxConcurrentWorkflowTaskExecutions: 200,
    maxConcurrentActivityTaskExecutions: 40,
    maxCachedWorkflows: 1000,
    maxConcurrentActivityTaskPolls: 5,
    maxConcurrentWorkflowTaskPolls: 5,
    workerTuner: undefined,
    processFailureShutdownDelay: 0,
    shutdownForceTime: undefined,
    shutdownGraceTime: undefined
  };

  const connectionMonitorInstance = {
    running: false,
    connectionLossError: null,
    onConnectionLost: vi.fn( cb => {
      connectionMonitorInstance.connectionLostCb = cb;
    } ),
    start: vi.fn( () => {
      connectionMonitorInstance.running = true;
      return promises.connectionMonitor.promise.finally( () => {
        connectionMonitorInstance.running = false;
      } );
    } ),
    stop: vi.fn( () => {
      connectionMonitorInstance.running = false;
      promises.connectionMonitor.resolve();
      return promises.connectionMonitor.promise;
    } ),
    connectionLostCb: null
  };

  const catalogJobInstance = {
    running: false,
    error: null,
    onError: vi.fn( cb => {
      catalogJobInstance.errorCb = cb;
    } ),
    run: vi.fn( () => {
      catalogJobInstance.running = true;
      return promises.catalogJob.promise.finally( () => {
        catalogJobInstance.running = false;
      } );
    } ),
    interrupt: vi.fn( () => {
      catalogJobInstance.running = false;
      promises.catalogJob.resolve();
      return promises.catalogJob.promise;
    } ),
    errorCb: null
  };

  const mockWorker = {
    getStatus: vi.fn( () => ( { runState: mockWorker.runState } ) ),
    run: vi.fn( () => promises.workerRun.promise ),
    runState: 'RUNNING',
    shutdown: vi.fn()
  };

  return {
    catalogJobInstance,
    bindGlobalFunctionsMock: vi.fn(),
    configValues,
    connectionMonitorInstance,
    createCatalogMock: vi.fn().mockReturnValue( { workflows: [], activities: {} } ),
    createWorkflowsEntryPointMock: vi.fn().mockReturnValue( '/fake/workflows/path.js' ),
    hashSourceCodeMock: vi.fn().mockResolvedValue( 'catalog-hash' ),
    initInterceptorsMock: vi.fn().mockReturnValue( [] ),
    loadActivitiesMock: vi.fn().mockResolvedValue( {} ),
    loadHooksMock: vi.fn().mockResolvedValue( undefined ),
    loadWorkflowsMock: vi.fn().mockResolvedValue( [] ),
    mainEventBusMock: { emit: vi.fn(), on: vi.fn() },
    mockConnection: { close: vi.fn().mockResolvedValue( undefined ) },
    mockLog: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
    mockWorker,
    promises,
    resetPromises,
    setupClientConfigMock: vi.fn(),
    setupInterruptionHandlerMock: vi.fn(),
    setupTelemetryMock: vi.fn()
  };
} );

vi.mock( '#logger', () => ( { createChildLogger: () => mockLog } ) );
vi.mock( '#consts', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual };
} );
const initTracing = vi.fn().mockResolvedValue( undefined );
vi.mock( '#tracing', () => ( { init: initTracing } ) );
vi.mock( '#bus', () => ( { mainEventBus: mainEventBusMock } ) );

const loadWorkflowsMock = vi.fn().mockResolvedValue( { workflows: [], entrypoint: '/fake/workflows/path.js' } );
const loadActivitiesMock = vi.fn().mockResolvedValue( { activities: {} } );
const loadHooksMock = vi.fn().mockResolvedValue( undefined );
vi.mock( './loader/workflows.js', () => ( { loadWorkflows: loadWorkflowsMock } ) );
vi.mock( './loader/activities.js', () => ( { loadActivities: loadActivitiesMock } ) );
vi.mock( './loader/hooks.js', () => ( { loadHooks: loadHooksMock } ) );
vi.mock( './configs.js', () => configValues );

const hashSourceCodeMock = vi.fn().mockResolvedValue( 'catalog-hash' );
vi.mock( './loader/tools.js', () => ( { hashSourceCode: hashSourceCodeMock } ) );

vi.mock( './sinks.js', () => ( { sinks: {} } ) );
vi.mock( './catalog_workflow/index.js', () => ( { createCatalog: createCatalogMock } ) );
vi.mock( './bundler_options.js', () => ( { webpackConfigHook: vi.fn() } ) );
vi.mock( './interceptors/index.js', () => ( { initInterceptors: initInterceptorsMock } ) );
vi.mock( './proxy.js', () => ( { bootstrapFetchProxy: vi.fn() } ) );
vi.mock( './telemetry.js', () => ( { setupTelemetry: setupTelemetryMock } ) );
vi.mock( './interruption.js', () => ( { setupInterruptionHandler: setupInterruptionHandlerMock } ) );
vi.mock( './global_functions.js', () => ( { bindGlobalFunctions: bindGlobalFunctionsMock } ) );
vi.mock( './connection_monitor.js', () => ( {
  TemporalConnectionMonitor: vi.fn( function () {
    return connectionMonitorInstance;
  } )
} ) );
vi.mock( './catalog_workflow/catalog_job.js', () => ( {
  CatalogJob: vi.fn( function () {
    return catalogJobInstance;
  } )
} ) );
vi.mock( './log_hooks.js', () => ( {} ) );
vi.mock( '#temporal/client', () => ( { setupClientConfig: setupClientConfigMock } ) );
vi.mock( '@temporalio/worker', () => ( {
  NativeConnection: { connect: vi.fn().mockResolvedValue( mockConnection ) },
  Worker: { create: vi.fn().mockResolvedValue( mockWorker ) }
} ) );

const importWorker = async () => {
  vi.resetModules();
  await import( './index.js' );
};

const settleWorker = async () => {
  promises.catalogJob.resolve();
  promises.connectionMonitor.resolve();
  promises.workerRun.resolve();
  await vi.waitFor( () => expect( mockConnection.close ).toHaveBeenCalled() );
};

describe( 'worker/index', () => {
  const exitMock = vi.fn();
  const originalArgv = process.argv;

  beforeEach( () => {
    vi.clearAllMocks();
    resetPromises();
    configValues.apiKey = undefined;
    configValues.grpcProxy = undefined;
    configValues.workerTuner = undefined;
    configValues.shutdownForceTime = undefined;
    configValues.shutdownGraceTime = undefined;
    catalogJobInstance.error = null;
    catalogJobInstance.errorCb = null;
    catalogJobInstance.running = false;
    connectionMonitorInstance.connectionLossError = null;
    connectionMonitorInstance.connectionLostCb = null;
    connectionMonitorInstance.running = false;
    mockConnection.close.mockResolvedValue( undefined );
    mockWorker.runState = 'RUNNING';
    process.argv = [ ...originalArgv.slice( 0, 2 ), '/test/caller/dir' ];
    vi.spyOn( process, 'exit' ).mockImplementation( exitMock );
  } );

  afterEach( () => {
    process.argv = originalArgv;
    vi.restoreAllMocks();
  } );

  it( 'creates the worker lifecycle jobs with expected dependencies', async () => {
    const { NativeConnection, Worker } = await import( '@temporalio/worker' );
    const { TemporalConnectionMonitor } = await import( './connection_monitor.js' );
    const { CatalogJob } = await import( './catalog_workflow/catalog_job.js' );

    await importWorker();

    await vi.waitFor( () => expect( Worker.create ).toHaveBeenCalled() );

    expect( loadHooksMock ).toHaveBeenCalledWith( '/test/caller/dir' );
    expect( loadWorkflowsMock ).toHaveBeenCalledWith( '/test/caller/dir' );
    expect( loadActivitiesMock ).toHaveBeenCalledWith( '/test/caller/dir', [] );
    expect( initTracing ).toHaveBeenCalled();
    expect( createCatalogMock ).toHaveBeenCalledWith( { workflows: [], activities: {} } );
    expect( hashSourceCodeMock ).toHaveBeenCalledWith( '/test/caller/dir' );
    expect( NativeConnection.connect ).toHaveBeenCalledWith( {
      address: configValues.address,
      tls: false,
      apiKey: undefined,
      proxy: undefined
    } );
    expect( setupClientConfigMock ).toHaveBeenCalledWith( {
      connection: mockConnection,
      namespace: configValues.namespace
    } );
    expect( bindGlobalFunctionsMock ).toHaveBeenCalledTimes( 1 );
    expect( bindGlobalFunctionsMock.mock.invocationCallOrder[0] ).toBeLessThan(
      NativeConnection.connect.mock.invocationCallOrder[0]
    );
    expect( TemporalConnectionMonitor ).toHaveBeenCalledWith( mockConnection );
    expect( CatalogJob ).toHaveBeenCalledWith( {
      connection: mockConnection,
      namespace: configValues.namespace,
      catalog: { workflows: [], activities: {} },
      catalogHash: 'catalog-hash'
    } );
    expect( Worker.create ).toHaveBeenCalledWith( expect.objectContaining( {
      connection: mockConnection,
      namespace: configValues.namespace,
      taskQueue: configValues.taskQueue,
      workflowsPath: '/fake/workflows/path.js',
      activities: {},
      maxConcurrentWorkflowTaskExecutions: configValues.maxConcurrentWorkflowTaskExecutions,
      maxConcurrentActivityTaskExecutions: configValues.maxConcurrentActivityTaskExecutions,
      maxCachedWorkflows: configValues.maxCachedWorkflows,
      maxConcurrentActivityTaskPolls: configValues.maxConcurrentActivityTaskPolls,
      maxConcurrentWorkflowTaskPolls: configValues.maxConcurrentWorkflowTaskPolls
    } ) );
    expect( Worker.create.mock.calls[0][0] ).not.toHaveProperty( 'shutdownForceTime' );
    expect( Worker.create.mock.calls[0][0] ).not.toHaveProperty( 'shutdownGraceTime' );
    expect( initInterceptorsMock ).toHaveBeenCalledWith( { activities: {}, workflows: [] } );
    expect( setupTelemetryMock ).toHaveBeenCalledWith( { worker: mockWorker } );
    expect( setupInterruptionHandlerMock ).toHaveBeenCalledWith( expect.any( Function ) );
    expect( connectionMonitorInstance.onConnectionLost ).toHaveBeenCalledWith( expect.any( Function ) );
    expect( catalogJobInstance.onError ).toHaveBeenCalledWith( expect.any( Function ) );
    expect( mockWorker.run ).toHaveBeenCalled();
    expect( connectionMonitorInstance.start ).toHaveBeenCalled();
    expect( catalogJobInstance.run ).toHaveBeenCalled();

    await settleWorker();
    expect( mockLog.info ).toHaveBeenCalledWith( 'Bye' );
  } );

  it( 'passes worker tuner instead of incompatible execution concurrency options', async () => {
    configValues.workerTuner = {
      tunerOptions: {
        targetMemoryUsage: 0.8,
        targetCpuUsage: 0.9
      }
    };
    const { Worker } = await import( '@temporalio/worker' );

    await importWorker();

    await vi.waitFor( () => expect( Worker.create ).toHaveBeenCalled() );

    const workerOptions = Worker.create.mock.calls[0][0];
    expect( workerOptions ).toEqual( expect.objectContaining( {
      tuner: configValues.workerTuner,
      maxCachedWorkflows: configValues.maxCachedWorkflows,
      maxConcurrentActivityTaskPolls: configValues.maxConcurrentActivityTaskPolls,
      maxConcurrentWorkflowTaskPolls: configValues.maxConcurrentWorkflowTaskPolls
    } ) );
    expect( workerOptions ).not.toHaveProperty( 'maxConcurrentWorkflowTaskExecutions' );
    expect( workerOptions ).not.toHaveProperty( 'maxConcurrentActivityTaskExecutions' );

    await settleWorker();
  } );

  it( 'enables TLS when apiKey is set', async () => {
    configValues.apiKey = 'secret';
    const { NativeConnection } = await import( '@temporalio/worker' );

    await importWorker();

    await vi.waitFor( () => expect( NativeConnection.connect ).toHaveBeenCalledWith( expect.objectContaining( {
      apiKey: 'secret',
      tls: true
    } ) ) );

    await settleWorker();
  } );

  it( 'passes configured shutdown durations to the worker', async () => {
    configValues.shutdownForceTime = '30s';
    configValues.shutdownGraceTime = '10s';
    const { Worker } = await import( '@temporalio/worker' );

    await importWorker();

    await vi.waitFor( () => expect( Worker.create ).toHaveBeenCalledWith( expect.objectContaining( {
      shutdownForceTime: '30s',
      shutdownGraceTime: '10s'
    } ) ) );

    await settleWorker();
  } );

  it( 'runs graceful shutdown when interrupted', async () => {
    await importWorker();

    await vi.waitFor( () => expect( setupInterruptionHandlerMock ).toHaveBeenCalled() );
    const [ shutdown ] = setupInterruptionHandlerMock.mock.calls[0];

    shutdown();

    expect( mockWorker.shutdown ).toHaveBeenCalledOnce();
    expect( connectionMonitorInstance.stop ).toHaveBeenCalledOnce();
    expect( catalogJobInstance.interrupt ).toHaveBeenCalledOnce();

    promises.workerRun.resolve();
    await vi.waitFor( () => expect( mockConnection.close ).toHaveBeenCalled() );
    expect( mockLog.info ).toHaveBeenCalledWith( 'Bye' );
  } );

  it( 'does not call worker.shutdown when worker has already failed', async () => {
    const error = new Error( 'Big Failure' );

    await importWorker();
    await vi.waitFor( () => expect( mockWorker.run ).toHaveBeenCalled() );

    mockWorker.runState = 'FAILED';
    promises.workerRun.reject( error );

    await vi.waitFor( () => expect( connectionMonitorInstance.stop ).toHaveBeenCalled() );
    expect( mockWorker.shutdown ).not.toHaveBeenCalled();

    promises.connectionMonitor.resolve();
    promises.catalogJob.resolve();

    await vi.waitFor( () => {
      expect( mockLog.error ).toHaveBeenCalledWith( 'Fatal error', expect.objectContaining( {
        error: 'Big Failure'
      } ) );
    } );
    expect( mainEventBusMock.emit ).toHaveBeenCalledWith( expect.any( String ), { error } );
    await vi.waitFor( () => expect( exitMock ).toHaveBeenCalledWith( 1 ) );
  } );

  it( 'throws connection monitor errors after graceful shutdown', async () => {
    const error = new Error( 'connection lost' );

    await importWorker();
    await vi.waitFor( () => expect( connectionMonitorInstance.onConnectionLost ).toHaveBeenCalled() );

    connectionMonitorInstance.connectionLossError = error;
    connectionMonitorInstance.connectionLostCb( error );
    promises.workerRun.resolve();

    await vi.waitFor( () => {
      expect( mockLog.error ).toHaveBeenCalledWith( 'Fatal error', expect.objectContaining( {
        error: 'connection lost'
      } ) );
    } );
    expect( mockWorker.shutdown ).toHaveBeenCalledOnce();
    expect( catalogJobInstance.interrupt ).toHaveBeenCalledOnce();
    expect( mainEventBusMock.emit ).toHaveBeenCalledWith( expect.any( String ), { error } );
  } );

  it( 'throws catalog job errors after graceful shutdown', async () => {
    const error = new Error( 'catalog failed' );

    await importWorker();
    await vi.waitFor( () => expect( catalogJobInstance.onError ).toHaveBeenCalled() );

    catalogJobInstance.error = error;
    catalogJobInstance.errorCb( error );
    promises.workerRun.resolve();

    await vi.waitFor( () => {
      expect( mockLog.error ).toHaveBeenCalledWith( 'Fatal error', expect.objectContaining( {
        error: 'catalog failed'
      } ) );
    } );
    expect( mockWorker.shutdown ).toHaveBeenCalledOnce();
    expect( connectionMonitorInstance.stop ).toHaveBeenCalledOnce();
    expect( mainEventBusMock.emit ).toHaveBeenCalledWith( expect.any( String ), { error } );
  } );

  it( 'cleans up partial startup failures after connecting', async () => {
    const { Worker } = await import( '@temporalio/worker' );
    const error = new Error( 'worker create failed' );
    Worker.create.mockRejectedValueOnce( error );

    await importWorker();

    await vi.waitFor( () => expect( mockConnection.close ).toHaveBeenCalled() );
    expect( connectionMonitorInstance.stop ).not.toHaveBeenCalled();
    expect( catalogJobInstance.interrupt ).not.toHaveBeenCalled();
    await vi.waitFor( () => {
      expect( mockLog.error ).toHaveBeenCalledWith( 'Fatal error', expect.objectContaining( {
        error: 'worker create failed'
      } ) );
    } );
  } );
} );
