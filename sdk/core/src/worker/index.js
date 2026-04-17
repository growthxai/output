import { Worker, NativeConnection } from '@temporalio/worker';
import * as configs from './configs.js';
import { loadActivities, loadHooks, loadWorkflows, createWorkflowsEntryPoint } from './loader.js';
import { sinks } from './sinks.js';
import { createCatalog } from './catalog_workflow/index.js';
import { init as initTracing } from '#tracing';
import { webpackConfigHook } from './bundler_options.js';
import { initInterceptors } from './interceptors.js';
import { createChildLogger } from '#logger';
import { registerShutdown } from './shutdown.js';
import { startCatalog } from './start_catalog.js';
import { bootstrapFetchProxy } from './proxy.js';
import { messageBus } from '#bus';
import './log_hooks.js';
import { BusEventType } from '#consts';

const log = createChildLogger( 'Worker' );

// Get caller directory from command line arguments
const callerDir = process.argv[2];

( async () => {
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

  log.info( 'Connecting Temporal...' );
  const proxy = grpcProxy ? { type: 'http-connect', targetHost: grpcProxy } : undefined;
  const connection = await NativeConnection.connect( { address, tls: Boolean( apiKey ), apiKey, proxy } );

  log.info( 'Creating worker...' );
  const worker = await Worker.create( {
    connection,
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

  registerShutdown( { worker, log } );

  log.info( 'Running worker...' );
  await Promise.all( [ worker.run(), startCatalog( { connection, namespace, catalog } ) ] );

  log.info( 'Closing connection...' );
  await connection.close();

  log.info( 'Bye' );

  process.exit( 0 );
} )().catch( error => {
  log.error( 'Fatal error', { message: error.message, stack: error.stack } );
  messageBus.emit( BusEventType.RUNTIME_ERROR, { error } );
  log.info( `Exiting in ${configs.processFailureShutdownDelay}ms` );
  setTimeout( () => process.exit( 1 ), configs.processFailureShutdownDelay );
} );
