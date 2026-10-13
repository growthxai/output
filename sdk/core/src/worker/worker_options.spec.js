import { beforeEach, describe, expect, it, vi } from 'vitest';

const configValues = vi.hoisted( () => ( {} ) );
const logMock = vi.hoisted( () => ( { info: vi.fn() } ) );

vi.mock( './configs.js', () => configValues );
vi.mock( '#logger', () => ( { createChildLogger: () => logMock } ) );

const defaultConfigs = {
  maxConcurrentWorkflowTaskExecutions: undefined,
  maxConcurrentActivityTaskExecutions: 40,
  maxCachedWorkflows: undefined,
  maxConcurrentActivityTaskPolls: 5,
  maxConcurrentWorkflowTaskPolls: 5,
  workflowThreadPoolSize: undefined,
  shutdownForceTime: undefined,
  shutdownGraceTime: undefined,
  workerTuner: undefined
};

const tuner = { tunerOptions: { targetMemoryUsage: 0.8, targetCpuUsage: 0.9 } };

const loadBuildWorkerOptions = async ( overrides = {} ) => {
  Object.assign( configValues, defaultConfigs, overrides );
  vi.resetModules();
  const { buildWorkerOptions } = await import( './worker_options.js' );
  return buildWorkerOptions;
};

describe( 'worker/worker_options', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'omits every option deferred to @temporalio/worker when unset', async () => {
    const buildWorkerOptions = await loadBuildWorkerOptions();

    expect( buildWorkerOptions() ).toStrictEqual( {
      maxConcurrentActivityTaskExecutions: 40,
      maxConcurrentActivityTaskPolls: 5,
      maxConcurrentWorkflowTaskPolls: 5
    } );
  } );

  it( 'forwards every option when set', async () => {
    const buildWorkerOptions = await loadBuildWorkerOptions( {
      maxConcurrentWorkflowTaskExecutions: 200,
      maxCachedWorkflows: 1000,
      workflowThreadPoolSize: 2,
      shutdownForceTime: '30s',
      shutdownGraceTime: '10s'
    } );

    expect( buildWorkerOptions() ).toStrictEqual( {
      maxConcurrentWorkflowTaskExecutions: 200,
      maxConcurrentActivityTaskExecutions: 40,
      maxCachedWorkflows: 1000,
      maxConcurrentActivityTaskPolls: 5,
      maxConcurrentWorkflowTaskPolls: 5,
      workflowThreadPoolSize: 2,
      shutdownForceTime: '30s',
      shutdownGraceTime: '10s'
    } );
  } );

  it( 'does not log tuner options when no tuner is configured', async () => {
    const buildWorkerOptions = await loadBuildWorkerOptions();

    buildWorkerOptions();

    expect( logMock.info ).not.toHaveBeenCalled();
  } );

  describe( 'with a worker tuner', () => {
    it( 'passes the tuner instead of the incompatible execution concurrency options', async () => {
      const buildWorkerOptions = await loadBuildWorkerOptions( { workerTuner: tuner, maxConcurrentWorkflowTaskExecutions: 200 } );

      const options = buildWorkerOptions();

      expect( options.tuner ).toBe( tuner );
      expect( options ).not.toHaveProperty( 'maxConcurrentWorkflowTaskExecutions' );
      expect( options ).not.toHaveProperty( 'maxConcurrentActivityTaskExecutions' );
    } );

    it( 'still applies the options the tuner does not replace', async () => {
      const buildWorkerOptions = await loadBuildWorkerOptions( { workerTuner: tuner, maxCachedWorkflows: 1000, workflowThreadPoolSize: 2 } );

      expect( buildWorkerOptions() ).toStrictEqual( {
        tuner,
        maxCachedWorkflows: 1000,
        maxConcurrentActivityTaskPolls: 5,
        maxConcurrentWorkflowTaskPolls: 5,
        workflowThreadPoolSize: 2
      } );
    } );

    it( 'logs the tuner options', async () => {
      const buildWorkerOptions = await loadBuildWorkerOptions( { workerTuner: tuner } );

      buildWorkerOptions();

      expect( logMock.info ).toHaveBeenCalledWith( 'Using worker tuner options', tuner );
    } );
  } );
} );
