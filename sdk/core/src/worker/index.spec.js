import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
vi.mock( '#logger', () => ( { createChildLogger: () => mockLog } ) );

vi.mock( '#consts', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual };
} );

vi.mock( '#tracing', () => ( { init: vi.fn().mockResolvedValue( undefined ) } ) );

const configValues = {
  address: 'localhost:7233',
  apiKey: undefined,
  namespace: 'default',
  taskQueue: 'test-queue',
  catalogId: 'test-catalog',
  maxConcurrentWorkflowTaskExecutions: 200,
  maxConcurrentActivityTaskExecutions: 40,
  maxCachedWorkflows: 1000,
  maxConcurrentActivityTaskPolls: 5,
  maxConcurrentWorkflowTaskPolls: 5,
  processFailureShutdownDelay: 0
};
vi.mock( './configs.js', () => configValues );

const messageBusMock = { on: vi.fn(), emit: vi.fn() };
vi.mock( '#bus', () => ( { messageBus: messageBusMock } ) );

const loadWorkflowsMock = vi.fn().mockResolvedValue( [] );
const loadActivitiesMock = vi.fn().mockResolvedValue( {} );
const loadHooksMock = vi.fn().mockResolvedValue( undefined );
const createWorkflowsEntryPointMock = vi.fn().mockReturnValue( '/fake/workflows/path.js' );
vi.mock( './loader.js', () => ( {
  loadWorkflows: loadWorkflowsMock,
  loadActivities: loadActivitiesMock,
  loadHooks: loadHooksMock,
  createWorkflowsEntryPoint: createWorkflowsEntryPointMock
} ) );

vi.mock( './sinks.js', () => ( { sinks: {} } ) );

const createCatalogMock = vi.fn().mockReturnValue( { workflows: [], activities: {} } );
vi.mock( './catalog_workflow/index.js', () => ( { createCatalog: createCatalogMock } ) );

vi.mock( './bundler_options.js', () => ( { webpackConfigHook: vi.fn() } ) );

const initInterceptorsMock = vi.fn().mockReturnValue( [] );
vi.mock( './interceptors.js', () => ( { initInterceptors: initInterceptorsMock } ) );

const startCatalogMock = vi.fn().mockResolvedValue( undefined );
vi.mock( './start_catalog.js', () => ( { startCatalog: startCatalogMock } ) );

const registerShutdownMock = vi.fn();
vi.mock( './shutdown.js', () => ( { registerShutdown: registerShutdownMock } ) );

vi.mock( './log_hooks.js', () => ( {} ) );

const runState = { resolve: null };
const runPromise = new Promise( r => {
  runState.resolve = r;
} );
const shutdownMock = vi.fn();
const mockConnection = { close: vi.fn().mockResolvedValue( undefined ) };
const mockWorker = { run: () => runPromise, shutdown: shutdownMock };

vi.mock( '@temporalio/worker', () => ( {
  Worker: { create: vi.fn().mockResolvedValue( mockWorker ) },
  NativeConnection: { connect: vi.fn().mockResolvedValue( mockConnection ) }
} ) );

describe( 'worker/index', () => {
  const exitMock = vi.fn();
  const originalArgv = process.argv;
  const originalExit = process.exit;

  beforeEach( () => {
    vi.clearAllMocks();
    process.argv = [ ...originalArgv.slice( 0, 2 ), '/test/caller/dir' ];
    process.exit = exitMock;
  } );

  afterEach( () => {
    process.argv = originalArgv;
    process.exit = originalExit;
    configValues.apiKey = undefined;
  } );

  it( 'loads configs, workflows, activities and creates worker with correct options', async () => {
    const { Worker, NativeConnection } = await import( '@temporalio/worker' );
    const { init: initTracing } = await import( '#tracing' );

    import( './index.js' );

    await vi.waitFor( () => {
      expect( loadHooksMock ).toHaveBeenCalledWith( '/test/caller/dir' );
    } );
    expect( loadWorkflowsMock ).toHaveBeenCalledWith( '/test/caller/dir' );
    expect( loadActivitiesMock ).toHaveBeenCalledWith( '/test/caller/dir', [] );
    expect( createWorkflowsEntryPointMock ).toHaveBeenCalledWith( [] );
    expect( initTracing ).toHaveBeenCalled();
    expect( createCatalogMock ).toHaveBeenCalledWith( { workflows: [], activities: {} } );
    expect( NativeConnection.connect ).toHaveBeenCalledWith( {
      address: configValues.address,
      tls: false,
      apiKey: undefined
    } );
    expect( Worker.create ).toHaveBeenCalledWith( expect.objectContaining( {
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
    expect( initInterceptorsMock ).toHaveBeenCalledWith( { activities: {}, workflows: [] } );
    expect( registerShutdownMock ).toHaveBeenCalledWith( { worker: mockWorker, log: mockLog } );
    expect( startCatalogMock ).toHaveBeenCalledWith( {
      connection: mockConnection,
      namespace: configValues.namespace,
      catalog: { workflows: [], activities: {} }
    } );

    runState.resolve();
    await vi.waitFor( () => {
      expect( mockConnection.close ).toHaveBeenCalled();
    } );
    expect( exitMock ).toHaveBeenCalledWith( 0 );
  } );

  it( 'enables TLS when apiKey is set', async () => {
    configValues.apiKey = 'secret';
    vi.resetModules();

    const { NativeConnection } = await import( '@temporalio/worker' );
    import( './index.js' );

    await vi.waitFor( () => {
      expect( NativeConnection.connect ).toHaveBeenCalledWith( expect.objectContaining( {
        tls: true,
        apiKey: 'secret'
      } ) );
    } );
    runState.resolve();
    await vi.waitFor( () => expect( exitMock ).toHaveBeenCalled() );
  } );

  it( 'calls registerShutdown with worker and log', async () => {
    vi.resetModules();

    import( './index.js' );

    await vi.waitFor( () => {
      expect( registerShutdownMock ).toHaveBeenCalledWith( { worker: mockWorker, log: mockLog } );
    } );
    runState.resolve();
    await vi.waitFor( () => expect( exitMock ).toHaveBeenCalled() );
  } );

  it( 'calls process.exit(1) on fatal error', async () => {
    loadWorkflowsMock.mockRejectedValueOnce( new Error( 'load failed' ) );
    vi.resetModules();

    import( './index.js' );

    await vi.waitFor( () => {
      expect( mockLog.error ).toHaveBeenCalledWith( 'Fatal error', expect.any( Object ) );
    } );
    await vi.waitFor( () => {
      expect( exitMock ).toHaveBeenCalledWith( 1 );
    } );
  } );
} );
