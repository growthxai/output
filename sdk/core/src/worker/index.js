import { Worker, NativeConnection } from '@temporalio/worker';
import * as configs from './configs.js';
import { loadActivities } from './loader/activities.js';
import { loadWorkflows } from './loader/workflows.js';
import { loadHooks } from './loader/hooks.js';
import { hashSourceCode } from './loader/tools.js';
import { sinks } from './sinks.js';
import { createCatalog } from './catalog_workflow/index.js';
import { init as initTracing } from '#tracing';
import { webpackConfigHook } from './bundler_options.js';
import { initInterceptors } from './interceptors/index.js';
import { createChildLogger } from '#logger';
import { setupInterruptionHandler, KillSignError } from './interruption.js';
import { CatalogPublisher } from './catalog_workflow/catalog_publisher.js';
import { mainEventBus } from '#bus';
import { flushPendingHooks } from '#hooks/pending_hooks';
import { BusEventType } from '#consts';
import { setupTelemetry } from './telemetry.js';
import { TemporalConnectionMonitor } from './connection_monitor.js';
import { bindGlobalFunctions } from './global_functions.js';
import { setupClientConfig } from '#temporal/client';
import { serializeError } from '#helpers/error_serializer';
import { setupTemporalLogger } from './temporal_logger.js';
import { WorkerRunner } from './worker_runner.js';
import { shutdownServices } from './shutdown.js';

import './log_hooks.js';

const log = createChildLogger( 'Worker' );

const {
  address,
  apiKey,
  namespace,
  taskQueue,
  grpcProxy,
  maxConcurrentWorkflowTaskExecutions,
  maxConcurrentActivityTaskExecutions,
  maxCachedWorkflows,
  maxConcurrentActivityTaskPolls,
  maxConcurrentWorkflowTaskPolls,
  shutdownForceTime,
  shutdownGraceTime,
  workerTuner
} = configs;

const services = {
  connection: null,
  connectionMonitor: null,
  catalogPublisher: null,
  workerRunner: null
};

// Get caller directory from command line arguments
const callerDir = process.argv[2];

const abortController = new AbortController();
const { signal } = abortController;

setupInterruptionHandler( abortController );

/** Run a given function or abort code if global signal was aborted */
const run = cb => signal.throwIfAborted() ?? cb();

const execute = async () => {
  log.info( 'Setting up Temporal Logger...' );
  run( setupTemporalLogger );

  log.info( 'Loading config...', { callerDir } );
  await run( () => loadHooks( callerDir ) );

  log.info( 'Loading workflows...', { callerDir } );
  const { workflows, entrypoint: workflowsPath } = await run( () => loadWorkflows( callerDir ) );

  log.info( 'Loading activities...', { callerDir } );
  const { activities } = await run( () => loadActivities( callerDir, workflows ) );

  mainEventBus.emit( BusEventType.WORKER_BEFORE_START );

  log.info( 'Initializing tracing...' );
  await run( initTracing );

  log.info( 'Creating workflows catalog...' );
  const catalog = run( () => createCatalog( { workflows, activities } ) );

  log.info( 'Computing catalog source code hash...' );
  const catalogHash = await run( () => hashSourceCode( callerDir ) );

  log.info( 'Binding globals...' );
  run( bindGlobalFunctions );

  log.info( 'Connecting Temporal...' );
  const proxy = grpcProxy ? { type: 'http-connect', targetHost: grpcProxy } : undefined;
  if ( proxy ) {
    log.info( 'Using gRPC proxy', { targetHost: grpcProxy } );
  }
  const connection = await run( () => NativeConnection.connect( { address, tls: Boolean( apiKey ), apiKey, proxy } ) );
  services.connection = connection;

  log.info( 'Setting up temporal endpoint...' );
  run( () => setupClientConfig( { connection, namespace } ) );

  log.info( 'Creating catalog publisher...' );
  services.catalogPublisher = run( () => new CatalogPublisher( { connection, namespace, catalog, catalogHash, signal } ) );

  log.info( 'Creating connection monitor...' );
  services.connectionMonitor = run( () => new TemporalConnectionMonitor( { connection, signal } ) );

  log.info( 'Publishing catalog workflow...' );
  await run( () => services.catalogPublisher.run() );

  log.info( 'Creating Temporal worker...' );
  const worker = await run( () => {
    if ( workerTuner ) {
      log.info( 'Using worker tuner options', { ...workerTuner } );
    }

    return Worker.create( {
      connection,
      namespace,
      taskQueue,
      workflowsPath,
      activities,
      sinks,
      interceptors: initInterceptors( { activities, workflows } ),
      // tuner isn't compatible with concurrent task executions configs
      ...( workerTuner ? {
        tuner: workerTuner
      } : {
        maxConcurrentWorkflowTaskExecutions,
        maxConcurrentActivityTaskExecutions
      } ),
      maxCachedWorkflows,
      maxConcurrentActivityTaskPolls,
      maxConcurrentWorkflowTaskPolls,
      bundlerOptions: { webpackConfigHook },
      ...( shutdownForceTime !== undefined && { shutdownForceTime } ),
      ...( shutdownGraceTime !== undefined && { shutdownGraceTime } )
    } );
  } );

  log.info( 'Setting up telemetry...' );
  run( () => setupTelemetry( { worker } ) );

  log.info( 'Creating worker runner...' );
  services.workerRunner = new WorkerRunner( { worker, signal } );

  /**
   * Runs the worker and connection monitor together
   * They will stop only upon receiving a wired kill signal (eg SIGINT), which resolves the promise
   */
  log.info( 'Running worker...' );
  await run( () => Promise.race( [
    services.workerRunner.start(),
    services.connectionMonitor.start()
  ] ) );

  signal.throwIfAborted();
  log.info( 'Worker terminated' );
};

execute()
  .catch( async error => abortController.abort( error ) )
  .finally( async () => {
    await shutdownServices( services );

    const hasError = signal.aborted && !( signal.reason instanceof KillSignError );
    if ( hasError ) {
      log.error( 'Worker error', { error: serializeError( signal.reason ) } );
      mainEventBus.emit( BusEventType.RUNTIME_ERROR, { error: signal.reason } );
    }

    log.info( 'Flushing hook callbacks...' );
    await flushPendingHooks();

    setTimeout( () => {
      log.info( 'Bye' );
      process.exit( hasError ? 1 : 0 );
    } );
  } );
