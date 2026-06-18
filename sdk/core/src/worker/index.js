import { Worker, NativeConnection } from '@temporalio/worker';
import * as configs from './configs.js';
import { loadActivities, loadHooks, loadWorkflows, createWorkflowsEntryPoint } from './loader.js';
import { sinks } from './sinks.js';
import { createCatalog } from './catalog_workflow/index.js';
import { init as initTracing } from '#tracing';
import { webpackConfigHook } from './bundler_options.js';
import { initInterceptors } from './interceptors/index.js';
import { createChildLogger } from '#logger';
import { setupInterruptionHandler } from './interruption.js';
import { CatalogJob } from './catalog_workflow/catalog_job.js';
import { bootstrapFetchProxy } from './proxy.js';
import { messageBus } from '#bus';
import { BusEventType } from '#consts';
import { hashSourceCode } from './loader_tools.js';
import { setupTelemetry } from './telemetry.js';
import { TemporalConnectionMonitor } from './connection_monitor.js';
import { runOnce } from '#utils';

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
  maxConcurrentWorkflowTaskPolls
} = configs;

const state = {
  connection: null,
  connectionMonitor: null,
  catalogJob: null,
  workerError: null
};

// Get caller directory from command line arguments
const callerDir = process.argv[2];

const execute = async () => {
  log.info( 'Loading config...', { callerDir } );
  await loadHooks( callerDir );

  log.info( 'Loading workflows...', { callerDir } );
  const workflows = await loadWorkflows( callerDir );

  log.info( 'Loading activities...', { callerDir } );
  const activities = await loadActivities( callerDir, workflows );

  messageBus.emit( BusEventType.WORKER_BEFORE_START );
  bootstrapFetchProxy();

  log.info( 'Creating worker entry point...' );
  const workflowsPath = createWorkflowsEntryPoint( workflows );

  log.info( 'Initializing tracing...' );
  await initTracing();

  log.info( 'Creating workflows catalog...' );
  const catalog = createCatalog( { workflows, activities } );

  log.info( 'Computing catalog source code hash...' );
  const catalogHash = await hashSourceCode( callerDir );

  log.info( 'Connecting Temporal...' );
  const proxy = grpcProxy ? { type: 'http-connect', targetHost: grpcProxy } : undefined;
  if ( proxy ) {
    log.info( 'Using gRPC proxy', { targetHost: grpcProxy } );
  }
  state.connection = await NativeConnection.connect( { address, tls: Boolean( apiKey ), apiKey, proxy } );

  log.info( 'Creating connection monitor...' );
  state.connectionMonitor = new TemporalConnectionMonitor( state.connection );

  log.info( 'Creating catalog job manager...' );
  state.catalogJob = new CatalogJob( { connection: state.connection, namespace, catalog, catalogHash } );

  log.info( 'Creating worker...' );
  const worker = await Worker.create( {
    connection: state.connection,
    namespace,
    taskQueue,
    workflowsPath,
    activities,
    sinks,
    interceptors: initInterceptors( { activities, workflows } ),
    maxConcurrentWorkflowTaskExecutions,
    maxConcurrentActivityTaskExecutions,
    maxCachedWorkflows,
    maxConcurrentActivityTaskPolls,
    maxConcurrentWorkflowTaskPolls,
    bundlerOptions: { webpackConfigHook }
  } );

  log.info( 'Setting up telemetry...' );
  setupTelemetry( { worker } );

  /**
   * NOTE
   * Temporal worker shutdown is a bit odd.
   * worker.run() is an async job that only resolves when calling worker.shutdown().
   * But worker.shutdown() is not async and returns nothing, so there is no way to await it.
   * All code that needs to run after shutdown needs to be after await worker.run().
   *
   * The following code needs to cover these scenarios:
   * 1. Connection monitor detects connection loss and stop the worker gracefully
   * 2. Catalog.run() has a failure and stop the worker and connection monitor gracefully
   * 2. Interruption is received and stop the connection monitor and worker gracefully
   * 3. Worker throws an error
   */

  /** Graceful shutdown */
  const shutdown = runOnce( () => {
    log.info( 'Shutdown started...' );
    if ( worker.getStatus().runState === 'RUNNING' ) {
      worker.shutdown();
    }
    state.connectionMonitor.stop();
    state.catalogJob.interrupt();
  } );

  /** When receiving an interruption, stop both promises that are long lived: worker and connectionMonitor */
  setupInterruptionHandler( shutdown );

  /** When the connection is lost, call shutdown */
  state.connectionMonitor.onConnectionLost( shutdown );

  /** If the catalog job manager fails, call shutdown */
  state.catalogJob.onError( shutdown );

  /** Runs the worker, connection monitor (long lived) and catalogJob (ephemeral) */
  log.info( 'Running worker...' );
  await Promise.all( [
    worker.run().catch( error => {
      state.workerError = error;
      shutdown();
    } ),
    state.connectionMonitor.start(),
    state.catalogJob.run()
  ] );

  log.info( 'Worker terminated' );

  const error =
    state.connectionMonitor.connectionLossError ??
    state.catalogJob.error ??
    state.workerError;

  /** After the shutdown, check for errors, if any found, throw it */
  if ( error ) {
    throw error;
  }
};

execute()
  .finally( async () => {
    // All errors here are ignored to not mask actual errors, and because this is already a shutdown
    if ( state.connectionMonitor?.running ) {
      log.info( 'Stopping connection monitor...' );
      await state.connectionMonitor.stop()
        .catch( e => log.warn( 'Connection monitor stop error', { error: e.message } ) );
    }
    if ( state.catalogJob?.running ) {
      log.info( 'Interrupting catalog job...' );
      await state.catalogJob.interrupt()
        .catch( e => log.warn( 'Catalog job interruption error', { error: e.message } ) );
    }
    if ( state.connection ) {
      log.info( 'Closing connection...' );
      await state.connection.close()
        .catch( e => log.warn( 'Connection close error', { error: e.message } ) );
    }
  } )
  .then( () => log.info( 'Bye' ) )
  .catch( error => {
    log.error( 'Fatal error', { error: error.message, stack: error.stack } );

    messageBus.emit( BusEventType.RUNTIME_ERROR, { error } );

    const timeToFlushEvent = configs.processFailureShutdownDelay;
    log.info( `Exiting in ${timeToFlushEvent}ms` );
    setTimeout( () => process.exit( 1 ), timeToFlushEvent );
  } );
