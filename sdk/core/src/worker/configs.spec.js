import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const CONFIG_KEYS = [
  'OUTPUT_CATALOG_ID',
  'TEMPORAL_ADDRESS',
  'TEMPORAL_API_KEY',
  'TEMPORAL_NAMESPACE',
  'TEMPORAL_MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS',
  'TEMPORAL_MAX_CONCURRENT_WORKFLOW_TASK_EXECUTIONS',
  'TEMPORAL_MAX_CACHED_WORKFLOWS',
  'TEMPORAL_MAX_CONCURRENT_ACTIVITY_TASK_POLLS',
  'TEMPORAL_MAX_CONCURRENT_WORKFLOW_TASK_POLLS',
  'TEMPORAL_WORKER_TUNER',
  'OUTPUT_WORKER_TELEMETRY_INTERVAL_MS',
  'OUTPUT_ACTIVITY_HEARTBEAT_INTERVAL_MS',
  'OUTPUT_ACTIVITY_HEARTBEAT_ENABLED',
  'TEMPORAL_SHUTDOWN_FORCE_TIME',
  'TEMPORAL_SHUTDOWN_GRACE_TIME'
];

const setEnv = ( overrides = {} ) => {
  process.env.OUTPUT_CATALOG_ID = overrides.OUTPUT_CATALOG_ID ?? 'test-catalog';
  CONFIG_KEYS.forEach( key => {
    if ( overrides[key] !== undefined ) {
      process.env[key] = String( overrides[key] );
    }
  } );
};

const clearEnv = () => {
  CONFIG_KEYS.forEach( key => delete process.env[key] );
};

async function loadConfigs() {
  vi.resetModules();
  return import( './configs.js' );
}

describe( 'worker/configs', () => {
  beforeEach( () => clearEnv() );
  afterEach( () => clearEnv() );

  it( 'throws when OUTPUT_CATALOG_ID is missing', async () => {
    clearEnv();
    vi.resetModules();

    await expect( import( './configs.js' ) ).rejects.toThrow();
  } );

  it( 'throws when OUTPUT_CATALOG_ID does not match regex', async () => {
    setEnv( { OUTPUT_CATALOG_ID: 'invalid space' } );
    vi.resetModules();

    await expect( import( './configs.js' ) ).rejects.toThrow();
  } );

  it( 'uses defaults when only OUTPUT_CATALOG_ID is set', async () => {
    setEnv();
    const configs = await loadConfigs();

    expect( configs.address ).toBe( 'localhost:7233' );
    expect( configs.namespace ).toBe( 'default' );
    expect( configs.maxConcurrentActivityTaskExecutions ).toBe( 40 );
    expect( configs.maxConcurrentWorkflowTaskExecutions ).toBe( 200 );
    expect( configs.maxCachedWorkflows ).toBe( 1000 );
    expect( configs.maxConcurrentActivityTaskPolls ).toBe( 5 );
    expect( configs.maxConcurrentWorkflowTaskPolls ).toBe( 5 );
    expect( configs.workerTuner ).toBeUndefined();
    expect( configs.workerTelemetryIntervalMs ).toBe( 0 );
    expect( configs.activityHeartbeatIntervalMs ).toBe( 2 * 60 * 1000 );
    expect( configs.activityHeartbeatEnabled ).toBe( true );
    expect( configs.shutdownForceTime ).toBeUndefined();
    expect( configs.shutdownGraceTime ).toBeUndefined();
    expect( configs.taskQueue ).toBe( 'test-catalog' );
    expect( configs.catalogId ).toBe( 'test-catalog' );
  } );

  it( 'treats empty string for optional number as default (preprocess)', async () => {
    setEnv( { TEMPORAL_MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS: '' } );
    const configs = await loadConfigs();

    expect( configs.maxConcurrentActivityTaskExecutions ).toBe( 40 );
  } );

  it( 'treats empty string for worker telemetry interval as default', async () => {
    setEnv( { OUTPUT_WORKER_TELEMETRY_INTERVAL_MS: '' } );
    const configs = await loadConfigs();

    expect( configs.workerTelemetryIntervalMs ).toBe( 0 );
  } );

  it( 'treats empty string for worker tuner as unset', async () => {
    setEnv( { TEMPORAL_WORKER_TUNER: '' } );
    const configs = await loadConfigs();

    expect( configs.workerTuner ).toBeUndefined();
  } );

  it( 'parses Temporal worker tuner JSON', async () => {
    const workerTuner = {
      tunerOptions: {
        targetMemoryUsage: 0.8,
        targetCpuUsage: 0.9
      },
      activityTaskSlotOptions: {
        minimumSlots: 1,
        maximumSlots: 100,
        rampThrottle: '50ms'
      }
    };

    setEnv( { TEMPORAL_WORKER_TUNER: JSON.stringify( workerTuner ) } );
    const configs = await loadConfigs();

    expect( configs.workerTuner ).toEqual( workerTuner );
  } );

  it( 'throws when Temporal worker tuner is not valid JSON', async () => {
    setEnv( { TEMPORAL_WORKER_TUNER: '{invalid' } );
    vi.resetModules();

    await expect( import( './configs.js' ) ).rejects.toThrow();
  } );

  it( 'throws when Temporal worker tuner is not a JSON object', async () => {
    setEnv( { TEMPORAL_WORKER_TUNER: '[]' } );
    vi.resetModules();

    await expect( import( './configs.js' ) ).rejects.toThrow();
  } );

  it( 'parses custom numeric env vars', async () => {
    setEnv( {
      TEMPORAL_MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS: '10',
      TEMPORAL_MAX_CONCURRENT_WORKFLOW_TASK_EXECUTIONS: '50',
      TEMPORAL_MAX_CACHED_WORKFLOWS: '500',
      OUTPUT_WORKER_TELEMETRY_INTERVAL_MS: '30000',
      OUTPUT_ACTIVITY_HEARTBEAT_INTERVAL_MS: '60000'
    } );
    const configs = await loadConfigs();

    expect( configs.maxConcurrentActivityTaskExecutions ).toBe( 10 );
    expect( configs.maxConcurrentWorkflowTaskExecutions ).toBe( 50 );
    expect( configs.maxCachedWorkflows ).toBe( 500 );
    expect( configs.workerTelemetryIntervalMs ).toBe( 30000 );
    expect( configs.activityHeartbeatIntervalMs ).toBe( 60000 );
  } );

  it( 'parses Temporal shutdown durations', async () => {
    setEnv( {
      TEMPORAL_SHUTDOWN_FORCE_TIME: '15000',
      TEMPORAL_SHUTDOWN_GRACE_TIME: '15s'
    } );
    const configs = await loadConfigs();

    expect( configs.shutdownForceTime ).toBe( '15000' );
    expect( configs.shutdownGraceTime ).toBe( '15s' );
  } );

  it( 'treats empty Temporal shutdown durations as unset', async () => {
    setEnv( {
      TEMPORAL_SHUTDOWN_FORCE_TIME: '',
      TEMPORAL_SHUTDOWN_GRACE_TIME: ''
    } );
    const configs = await loadConfigs();

    expect( configs.shutdownForceTime ).toBeUndefined();
    expect( configs.shutdownGraceTime ).toBeUndefined();
  } );

  it( 'throws when Temporal shutdown durations are invalid', async () => {
    setEnv( { TEMPORAL_SHUTDOWN_FORCE_TIME: 'soon' } );
    vi.resetModules();

    await expect( import( './configs.js' ) ).rejects.toThrow();
  } );

  it( 'allows zero for worker telemetry interval', async () => {
    setEnv( { OUTPUT_WORKER_TELEMETRY_INTERVAL_MS: '0' } );
    const configs = await loadConfigs();

    expect( configs.workerTelemetryIntervalMs ).toBe( 0 );
  } );

  it( 'throws when worker telemetry interval is negative', async () => {
    setEnv( { OUTPUT_WORKER_TELEMETRY_INTERVAL_MS: '-1' } );
    vi.resetModules();

    await expect( import( './configs.js' ) ).rejects.toThrow();
  } );

  it( 'throws when optional number is zero or negative', async () => {
    setEnv( { TEMPORAL_MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS: '0' } );
    vi.resetModules();

    await expect( import( './configs.js' ) ).rejects.toThrow();
  } );

  it( 'OUTPUT_ACTIVITY_HEARTBEAT_ENABLED: "true"|"1"|"on" → true', async () => {
    for ( const val of [ 'true', '1', 'on' ] ) {
      setEnv( { OUTPUT_ACTIVITY_HEARTBEAT_ENABLED: val } );
      const configs = await loadConfigs();
      expect( configs.activityHeartbeatEnabled ).toBe( true );
      clearEnv();
    }
  } );

  it( 'OUTPUT_ACTIVITY_HEARTBEAT_ENABLED: "false"|other → false, undefined → true', async () => {
    setEnv( { OUTPUT_ACTIVITY_HEARTBEAT_ENABLED: 'false' } );
    const configsFalse = await loadConfigs();
    expect( configsFalse.activityHeartbeatEnabled ).toBe( false );

    setEnv( { OUTPUT_ACTIVITY_HEARTBEAT_ENABLED: '0' } );
    const configsZero = await loadConfigs();
    expect( configsZero.activityHeartbeatEnabled ).toBe( false );

    clearEnv();
    setEnv(); // only OUTPUT_CATALOG_ID; OUTPUT_ACTIVITY_HEARTBEAT_ENABLED absent → default true
    const configsDefault = await loadConfigs();
    expect( configsDefault.activityHeartbeatEnabled ).toBe( true );
  } );

  it( 'parses TEMPORAL_ADDRESS and TEMPORAL_NAMESPACE', async () => {
    setEnv( { TEMPORAL_ADDRESS: 'temporal:7233', TEMPORAL_NAMESPACE: 'my-ns' } );
    const configs = await loadConfigs();

    expect( configs.address ).toBe( 'temporal:7233' );
    expect( configs.namespace ).toBe( 'my-ns' );
  } );
} );
