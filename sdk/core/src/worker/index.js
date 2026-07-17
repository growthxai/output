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
import { setupInterruptionHandler } from './interruption.js';
import { CatalogJob } from './catalog_workflow/catalog_job.js';
import { mainEventBus } from '#bus';
import { BusEventType } from '#consts';
import { setupTelemetry } from './telemetry.js';
import { TemporalConnectionMonitor } from './connection_monitor.js';
import { bindGlobalFunctions } from './global_functions.js';
import { runOnce } from '#helpers/function';

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
  const { workflows, entrypoint: workflowsPath } = await loadWorkflows( callerDir );

  log.info( 'Loading activities...', { callerDir } );
  const { activities } = await loadActivities( callerDir, workflows );

  mainEventBus.emit( BusEventType.WORKER_BEFORE_START );

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

  bindGlobalFunctions();

  state.connection = await NativeConnection.connect( { address, tls: Boolean( apiKey ), apiKey, proxy } );

  log.info( 'Creating connection monitor...' );
  state.connectionMonitor = new TemporalConnectionMonitor( state.connection );

  log.info( 'Creating catalog job manager...' );
  state.catalogJob = new CatalogJob( { connection: state.connection, namespace, catalog, catalogHash } );

  log.info( 'Creating worker...' );
  if ( workerTuner ) {
    log.info( 'Using worker tuner options', { ...workerTuner } );
  }
  const worker = await Worker.create( {
    connection: state.connection,
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

  log.info( 'Setting up telemetry...' );
  setupTelemetry( { worker } );

  /**
   * NOTE
   * Temporal worker shutdown is a bit odd.
   * worker.run() is an async job that only resolves when calling worker.shutdown().
   * But worker.shutdown() is not async and returns nothing, so there is no way to await it.
   * All code that needs to run after shutdown needs to be after `await worker.run()`.
   *
   * The following code needs to cover these scenarios:
   * 1. Connection monitor detects connection loss
   * 2. Catalog.run() has a failure
   * 3. Interruption is received
   * 4. Worker throws an error
   *
   * For each scenario all promises in the Promise.all() need to be completed via functions:
   * connectionMonitor.stop(), catalogJob.interrupt(), worker.shutdown()
   */

  /**
   * Graceful shutdown
   * Triggers the actions that will resolve all promises in the Promise.all(), so the code can resume
   */
  const shutdown = runOnce( () => {
    log.info( 'Shutdown started...' );
    if ( worker.getStatus().runState === 'RUNNING' ) {
      worker.shutdown();
    }
    state.connectionMonitor.stop();
    state.catalogJob.interrupt();
  } );

  /** When receiving an interruption, call shutdown */
  setupInterruptionHandler( shutdown );

  /** When the connection is lost, call shutdown */
  state.connectionMonitor.onConnectionLost( shutdown );

  /** If the catalog job manager fails, call shutdown */
  state.catalogJob.onError( shutdown );

  /**
   * Runs the worker, connection monitor and catalogJob (ephemeral)
   * None of these will reject in normal conditions. Errors need to be inspected later
   * They will resolve only when calling the actions in shutdown(),
   * except catalogJob, which can resolve by itself given a bit of time
   */
  log.info( 'Running worker...' );
  await Promise.all( [
    // When the worker fails, store the error and call shutdown
    worker.run().catch( error => {
      state.workerError = error;
      shutdown();
    } ),
    state.connectionMonitor.start(),
    state.catalogJob.run()
  ] );

  log.info( 'Worker terminated' );

  /** After the Promise.all() is resolved, check which services had an error, since none rejects the promise */
  const error =
    state.connectionMonitor.connectionLossError ??
    state.catalogJob.error ??
    state.workerError;

  /** If any error is found, throws it, so this process can exit with code=1 (failure) */
  if ( error ) {
    throw error;
  }
};

execute()
  .finally( async () => {
    /**
     * This will make sure that if we had any uncaught failures, everything is tore down.
     * Ignore any errors here in order to not mask actually errors from before and because at this point
     * the code is already shutting down, so no need to throw anyway.
     *
     * worker.shutdown() is not tried here, because it cannot be awaited. By this point is safe to say
     * that worker never started, already crashed or was stopped anyway.
     */
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

    mainEventBus.emit( BusEventType.RUNTIME_ERROR, { error } );

    const timeToFlushEvent = configs.processFailureShutdownDelay;
    log.info( `Exiting in ${timeToFlushEvent}ms` );
    setTimeout( () => process.exit( 1 ), timeToFlushEvent );
  } );
