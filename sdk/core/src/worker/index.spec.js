import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BusEventType } from '#consts';

const {
  bindGlobalFunctionsMock,
  catalogPublisherInstance,
  configValues,
  connectionMonitorInstance,
  createCatalogMock,
  flushPendingHooksMock,
  GracefulShutdownPeriodExpiredError,
  hashSourceCodeMock,
  initInterceptorsMock,
  interruption,
  loadActivitiesMock,
  loadHooksMock,
  loadWorkflowsMock,
  mainEventBusMock,
  mockConnection,
  mockLog,
  mockWorker,
  promises,
  resetPromises,
  serializeErrorMock,
  setupClientConfigMock,
  setupInterruptionHandlerMock,
  setupTelemetryMock,
  setupTemporalLoggerMock,
  shutdownServicesMock,
  workerRunnerInstance
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
    promises.workerRunner = createDeferred();
    promises.connectionMonitor = createDeferred();
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
    shutdownForceTime: undefined,
    shutdownGraceTime: undefined,
    hookFlushTimeoutMs: 5000
  };

  /**
   * The real runner only settles once the worker finished draining, which is triggered by stop().
   * Aborting alone leaves it running, so the shutdown sequence is the one awaiting the drain.
   */
  const workerRunnerInstance = {
    running: false,
    options: null,
    start: vi.fn( () => {
      workerRunnerInstance.running = true;
      return promises.workerRunner.promise.finally( () => {
        workerRunnerInstance.running = false;
      } );
    } ),
    stop: vi.fn( () => {
      promises.workerRunner.resolve();
      return promises.workerRunner.promise.catch( () => {} );
    } )
  };

  /** The real monitor exits its loop as soon as the signal aborts, so it settles on its own. */
  const connectionMonitorInstance = {
    running: false,
    options: null,
    start: vi.fn( () => {
      connectionMonitorInstance.running = true;
      connectionMonitorInstance.options?.signal.addEventListener(
        'abort',
        () => promises.connectionMonitor.resolve(),
        { once: true }
      );
      return promises.connectionMonitor.promise.finally( () => {
        connectionMonitorInstance.running = false;
      } );
    } ),
    stop: vi.fn( () => {
      promises.connectionMonitor.resolve();
      return promises.connectionMonitor.promise.catch( () => {} );
    } )
  };

  const catalogPublisherInstance = {
    running: false,
    options: null,
    run: vi.fn().mockResolvedValue( undefined ),
    interrupt: vi.fn().mockResolvedValue( undefined )
  };

  class KillSignError extends Error {
    name = 'KillSignError';
  };

  class UncaughtError extends Error {
    name = 'UncaughtError';
  };

  /** Stands in for the Temporal error thrown when the drain outlives the force time */
  class GracefulShutdownPeriodExpiredError extends Error {
    name = 'GracefulShutdownPeriodExpiredError';
  };

  const interruption = { controller: null, KillSignError, UncaughtError };

  return {
    bindGlobalFunctionsMock: vi.fn(),
    catalogPublisherInstance,
    configValues,
    connectionMonitorInstance,
    createCatalogMock: vi.fn().mockReturnValue( { workflowNames: [ 'demo' ] } ),
    flushPendingHooksMock: vi.fn().mockResolvedValue( undefined ),
    GracefulShutdownPeriodExpiredError,
    hashSourceCodeMock: vi.fn().mockResolvedValue( 'catalog-hash' ),
    initInterceptorsMock: vi.fn().mockReturnValue( [] ),
    interruption,
    loadActivitiesMock: vi.fn().mockResolvedValue( { activities: {} } ),
    loadHooksMock: vi.fn().mockResolvedValue( undefined ),
    loadWorkflowsMock: vi.fn().mockResolvedValue( { workflows: [], entrypoint: '/fake/workflows/path.js' } ),
    mainEventBusMock: { emit: vi.fn(), on: vi.fn() },
    mockConnection: { close: vi.fn().mockResolvedValue( undefined ) },
    mockLog: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
    mockWorker: { name: 'temporal-worker' },
    promises,
    resetPromises,
    serializeErrorMock: vi.fn( error => ( { name: error.name, message: error.message } ) ),
    setupClientConfigMock: vi.fn(),
    setupInterruptionHandlerMock: vi.fn( controller => {
      interruption.controller = controller;
    } ),
    setupTelemetryMock: vi.fn(),
    setupTemporalLoggerMock: vi.fn(),
    shutdownServicesMock: vi.fn().mockResolvedValue( [] ),
    workerRunnerInstance
  };
} );

const initTracing = vi.fn().mockResolvedValue( undefined );

vi.mock( '#logger', () => ( { createChildLogger: () => mockLog } ) );
vi.mock( '#helpers/error_serializer', () => ( { serializeError: serializeErrorMock } ) );
vi.mock( '#tracing', () => ( { init: initTracing } ) );
vi.mock( '#bus', () => ( { mainEventBus: mainEventBusMock } ) );
vi.mock( '#hooks/pending_hooks', () => ( { flushPendingHooks: flushPendingHooksMock } ) );
vi.mock( '#temporal/client', () => ( { setupClientConfig: setupClientConfigMock } ) );
vi.mock( './configs.js', () => configValues );
vi.mock( './loader/workflows.js', () => ( { loadWorkflows: loadWorkflowsMock } ) );
vi.mock( './loader/activities.js', () => ( { loadActivities: loadActivitiesMock } ) );
vi.mock( './loader/hooks.js', () => ( { loadHooks: loadHooksMock } ) );
vi.mock( './loader/tools.js', () => ( { hashSourceCode: hashSourceCodeMock } ) );
vi.mock( './sinks.js', () => ( { sinks: {} } ) );
vi.mock( './catalog_workflow/index.js', () => ( { createCatalog: createCatalogMock } ) );
vi.mock( './bundler_options.js', () => ( { webpackConfigHook: vi.fn() } ) );
vi.mock( './interceptors/index.js', () => ( { initInterceptors: initInterceptorsMock } ) );
vi.mock( './telemetry.js', () => ( { setupTelemetry: setupTelemetryMock } ) );
vi.mock( './global_functions.js', () => ( { bindGlobalFunctions: bindGlobalFunctionsMock } ) );
vi.mock( './temporal_logger.js', () => ( { setupTemporalLogger: setupTemporalLoggerMock } ) );
vi.mock( './log_hooks.js', () => ( {} ) );
vi.mock( './interruption.js', () => ( {
  setupInterruptionHandler: setupInterruptionHandlerMock,
  KillSignError: interruption.KillSignError,
  UncaughtError: interruption.UncaughtError
} ) );
vi.mock( './worker_runner.js', () => ( {
  WorkerRunner: vi.fn( function ( options ) {
    workerRunnerInstance.options = options;
    return workerRunnerInstance;
  } )
} ) );
vi.mock( './connection_monitor.js', () => ( {
  TemporalConnectionMonitor: vi.fn( function ( options ) {
    connectionMonitorInstance.options = options;
    return connectionMonitorInstance;
  } )
} ) );
vi.mock( './catalog_workflow/catalog_publisher.js', () => ( {
  CatalogPublisher: vi.fn( function ( options ) {
    catalogPublisherInstance.options = options;
    return catalogPublisherInstance;
  } )
} ) );
vi.mock( './shutdown.js', () => ( { shutdownServices: shutdownServicesMock } ) );
vi.mock( '@temporalio/worker', () => ( {
  NativeConnection: { connect: vi.fn().mockResolvedValue( mockConnection ) },
  Worker: { create: vi.fn().mockResolvedValue( mockWorker ) },
  GracefulShutdownPeriodExpiredError
} ) );

const importWorker = async () => {
  vi.resetModules();
  await import( './index.js' );
};

/** Imports the worker and waits until it is polling, which is where a healthy boot settles. */
const bootWorker = async () => {
  await importWorker();
  await vi.waitFor( () => {
    expect( workerRunnerInstance.start ).toHaveBeenCalled();
    expect( connectionMonitorInstance.start ).toHaveBeenCalled();
  } );
};

const waitForExit = () => vi.waitFor( () => expect( process.exit ).toHaveBeenCalled() );

describe( 'worker/index', () => {
  const originalArgv = process.argv;

  beforeEach( () => {
    vi.clearAllMocks();
    resetPromises();
    configValues.apiKey = undefined;
    configValues.grpcProxy = undefined;
    configValues.workerTuner = undefined;
    configValues.shutdownForceTime = undefined;
    configValues.shutdownGraceTime = undefined;
    workerRunnerInstance.running = false;
    workerRunnerInstance.options = null;
    connectionMonitorInstance.running = false;
    connectionMonitorInstance.options = null;
    catalogPublisherInstance.running = false;
    catalogPublisherInstance.options = null;
    interruption.controller = null;
    mockConnection.close.mockResolvedValue( undefined );
    process.argv = [ ...originalArgv.slice( 0, 2 ), '/test/caller/dir' ];
    vi.spyOn( process, 'exit' ).mockImplementation( () => undefined );
  } );

  afterEach( () => {
    process.argv = originalArgv;
    vi.restoreAllMocks();
  } );

  describe( 'startup', () => {
    it( 'wires every lifecycle component with the shared abort signal', async () => {
      const { NativeConnection, Worker } = await import( '@temporalio/worker' );
      const { TemporalConnectionMonitor } = await import( './connection_monitor.js' );
      const { CatalogPublisher } = await import( './catalog_workflow/catalog_publisher.js' );
      const { WorkerRunner } = await import( './worker_runner.js' );

      await bootWorker();

      const { signal } = interruption.controller;

      expect( setupInterruptionHandlerMock ).toHaveBeenCalledWith( expect.any( AbortController ) );
      expect( setupTemporalLoggerMock ).toHaveBeenCalledOnce();
      expect( loadHooksMock ).toHaveBeenCalledWith( '/test/caller/dir' );
      expect( loadWorkflowsMock ).toHaveBeenCalledWith( '/test/caller/dir' );
      expect( loadActivitiesMock ).toHaveBeenCalledWith( '/test/caller/dir', [] );
      expect( mainEventBusMock.emit ).toHaveBeenCalledWith( BusEventType.WORKER_BEFORE_START );
      expect( initTracing ).toHaveBeenCalledOnce();
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
      expect( CatalogPublisher ).toHaveBeenCalledWith( {
        connection: mockConnection,
        namespace: configValues.namespace,
        catalog: { workflowNames: [ 'demo' ] },
        catalogHash: 'catalog-hash',
        signal
      } );
      expect( catalogPublisherInstance.run ).toHaveBeenCalledOnce();
      expect( TemporalConnectionMonitor ).toHaveBeenCalledWith( { connection: mockConnection, signal } );
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
      expect( WorkerRunner ).toHaveBeenCalledWith( { worker: mockWorker, signal } );
    } );

    it( 'publishes the catalog before creating the worker', async () => {
      const { Worker } = await import( '@temporalio/worker' );

      await bootWorker();

      // The worker never exists unless its catalog matches its own source code.
      expect( catalogPublisherInstance.run.mock.invocationCallOrder[0] )
        .toBeLessThan( Worker.create.mock.invocationCallOrder[0] );
    } );

    it( 'passes worker tuner instead of incompatible execution concurrency options', async () => {
      configValues.workerTuner = { tunerOptions: { targetMemoryUsage: 0.8, targetCpuUsage: 0.9 } };
      const { Worker } = await import( '@temporalio/worker' );

      await bootWorker();

      const workerOptions = Worker.create.mock.calls[0][0];
      expect( workerOptions ).toEqual( expect.objectContaining( { tuner: configValues.workerTuner } ) );
      expect( workerOptions ).not.toHaveProperty( 'maxConcurrentWorkflowTaskExecutions' );
      expect( workerOptions ).not.toHaveProperty( 'maxConcurrentActivityTaskExecutions' );
    } );

    it( 'enables TLS when an apiKey is set', async () => {
      configValues.apiKey = 'secret';
      const { NativeConnection } = await import( '@temporalio/worker' );

      await bootWorker();

      expect( NativeConnection.connect ).toHaveBeenCalledWith( expect.objectContaining( { apiKey: 'secret', tls: true } ) );
    } );

    it( 'routes the connection through the configured gRPC proxy', async () => {
      configValues.grpcProxy = 'proxy:1234';
      const { NativeConnection } = await import( '@temporalio/worker' );

      await bootWorker();

      expect( NativeConnection.connect ).toHaveBeenCalledWith( expect.objectContaining( {
        proxy: { type: 'http-connect', targetHost: 'proxy:1234' }
      } ) );
    } );

    it( 'passes configured shutdown durations to the worker', async () => {
      configValues.shutdownForceTime = '30s';
      configValues.shutdownGraceTime = '10s';
      const { Worker } = await import( '@temporalio/worker' );

      await bootWorker();

      expect( Worker.create ).toHaveBeenCalledWith( expect.objectContaining( {
        shutdownForceTime: '30s',
        shutdownGraceTime: '10s'
      } ) );
    } );

    it( 'stops advancing through startup once the signal aborts', async () => {
      const { NativeConnection } = await import( '@temporalio/worker' );
      loadHooksMock.mockImplementationOnce( async () => {
        interruption.controller.abort( new interruption.KillSignError( 'SIGTERM' ) );
      } );

      await importWorker();
      await waitForExit();

      expect( loadWorkflowsMock ).not.toHaveBeenCalled();
      expect( NativeConnection.connect ).not.toHaveBeenCalled();
      expect( mockLog.error ).not.toHaveBeenCalled();
      expect( process.exit ).toHaveBeenCalledWith( 0 );
    } );
  } );

  describe( 'clean termination', () => {
    it( 'shuts every service down and exits successfully on a kill signal', async () => {
      await bootWorker();

      interruption.controller.abort( new interruption.KillSignError( 'SIGTERM' ) );
      await waitForExit();

      expect( shutdownServicesMock ).toHaveBeenCalledOnce();
      expect( shutdownServicesMock ).toHaveBeenCalledWith( {
        workerRunner: workerRunnerInstance,
        connectionMonitor: connectionMonitorInstance,
        catalogPublisher: catalogPublisherInstance,
        connection: mockConnection
      } );
      expect( mockLog.error ).not.toHaveBeenCalled();
      expect( mainEventBusMock.emit ).not.toHaveBeenCalledWith( BusEventType.RUNTIME_ERROR, expect.anything() );
      expect( mockLog.info ).toHaveBeenCalledWith( 'Bye' );
      expect( process.exit ).toHaveBeenCalledWith( 0 );
    } );

    it( 'still exits cleanly when a service other than the worker failed to stop', async () => {
      await bootWorker();
      shutdownServicesMock.mockResolvedValueOnce( [ { service: 'connection', error: new Error( 'close failed' ) } ] );

      interruption.controller.abort( new interruption.KillSignError( 'SIGTERM' ) );
      await waitForExit();

      expect( mockLog.error ).not.toHaveBeenCalled();
      expect( process.exit ).toHaveBeenCalledWith( 0 );
    } );

    it( 'still exits cleanly when the drain outlived the force time', async () => {
      await bootWorker();
      const error = new GracefulShutdownPeriodExpiredError( 'Timed out while waiting for worker to shutdown gracefully' );
      shutdownServicesMock.mockResolvedValueOnce( [ { service: 'worker', error } ] );

      interruption.controller.abort( new interruption.KillSignError( 'SIGTERM' ) );
      await waitForExit();

      expect( mockLog.error ).not.toHaveBeenCalled();
      expect( process.exit ).toHaveBeenCalledWith( 0 );
    } );

    it( 'does not report the worker as terminated when a signal ended the run', async () => {
      await bootWorker();

      interruption.controller.abort( new interruption.KillSignError( 'SIGTERM' ) );
      await waitForExit();

      expect( mockLog.info ).not.toHaveBeenCalledWith( 'Worker terminated' );
    } );

    it( 'reports a terminated worker when the run ends without an abort', async () => {
      await bootWorker();

      promises.connectionMonitor.resolve();
      await waitForExit();

      expect( mockLog.info ).toHaveBeenCalledWith( 'Worker terminated' );
      expect( process.exit ).toHaveBeenCalledWith( 0 );
    } );

    it( 'flushes pending hooks before exiting', async () => {
      await bootWorker();

      interruption.controller.abort( new interruption.KillSignError( 'SIGTERM' ) );
      await waitForExit();

      expect( flushPendingHooksMock ).toHaveBeenCalledWith( 5000 );
      expect( shutdownServicesMock.mock.invocationCallOrder[0] )
        .toBeLessThan( flushPendingHooksMock.mock.invocationCallOrder[0] );
      expect( flushPendingHooksMock.mock.invocationCallOrder[0] )
        .toBeLessThan( process.exit.mock.invocationCallOrder[0] );
    } );
  } );

  describe( 'failures', () => {
    it( 'reports an uncaught error captured by the interruption handler', async () => {
      const cause = new Error( 'boom' );
      await bootWorker();

      const fault = new interruption.UncaughtError( 'uncaughtException', { cause } );
      interruption.controller.abort( fault );
      await waitForExit();

      expect( mockLog.error ).toHaveBeenCalledWith( 'Worker error', {
        error: expect.objectContaining( { name: 'UncaughtError', message: 'uncaughtException' } )
      } );
      expect( mainEventBusMock.emit ).toHaveBeenCalledWith( BusEventType.RUNTIME_ERROR, { error: fault } );
      expect( process.exit ).toHaveBeenCalledWith( 1 );
    } );

    it( 'exits with a failure when the worker never finished draining', async () => {
      await bootWorker();
      shutdownServicesMock.mockResolvedValueOnce( [ { service: 'worker', error: new Error( 'drain failed' ) } ] );

      interruption.controller.abort( new interruption.KillSignError( 'SIGTERM' ) );
      await waitForExit();

      expect( process.exit ).toHaveBeenCalledWith( 1 );
    } );

    it( 'reports a lost connection and shuts down', async () => {
      const error = new Error( 'connection lost' );
      await bootWorker();

      promises.connectionMonitor.reject( error );
      await waitForExit();

      expect( shutdownServicesMock ).toHaveBeenCalledOnce();
      expect( serializeErrorMock ).toHaveBeenCalledWith( error );
      expect( mockLog.error ).toHaveBeenCalledWith( 'Worker error', {
        error: expect.objectContaining( { message: 'connection lost' } )
      } );
      expect( mainEventBusMock.emit ).toHaveBeenCalledWith( BusEventType.RUNTIME_ERROR, { error } );
      expect( process.exit ).toHaveBeenCalledWith( 1 );
    } );

    it( 'reports a failed worker run', async () => {
      const error = new Error( 'worker crashed' );
      await bootWorker();

      promises.workerRunner.reject( error );
      await waitForExit();

      expect( shutdownServicesMock ).toHaveBeenCalledOnce();
      expect( mockLog.error ).toHaveBeenCalledWith( 'Worker error', {
        error: expect.objectContaining( { message: 'worker crashed' } )
      } );
      expect( process.exit ).toHaveBeenCalledWith( 1 );
    } );

    it( 'never creates the worker when publishing the catalog fails', async () => {
      const { Worker } = await import( '@temporalio/worker' );
      catalogPublisherInstance.run.mockRejectedValueOnce( new Error( 'catalog failed' ) );

      await importWorker();
      await waitForExit();

      expect( Worker.create ).not.toHaveBeenCalled();
      expect( workerRunnerInstance.start ).not.toHaveBeenCalled();
      expect( shutdownServicesMock ).toHaveBeenCalledOnce();
      expect( mockLog.error ).toHaveBeenCalledWith( 'Worker error', {
        error: expect.objectContaining( { message: 'catalog failed' } )
      } );
      expect( process.exit ).toHaveBeenCalledWith( 1 );
    } );

    it( 'hands the partially built services to shutdown when startup fails', async () => {
      const { Worker } = await import( '@temporalio/worker' );
      Worker.create.mockRejectedValueOnce( new Error( 'worker create failed' ) );

      await importWorker();
      await waitForExit();

      expect( workerRunnerInstance.start ).not.toHaveBeenCalled();
      expect( shutdownServicesMock ).toHaveBeenCalledWith( expect.objectContaining( {
        workerRunner: null,
        connection: mockConnection
      } ) );
      expect( process.exit ).toHaveBeenCalledWith( 1 );
    } );
  } );
} );
