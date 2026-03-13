import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const CONFIG_KEYS = [
  'NODE_ENV',
  'TEMPORAL_ADDRESS',
  'TEMPORAL_NAMESPACE',
  'TEMPORAL_WORKFLOW_EXECUTION_TIMEOUT',
  'TEMPORAL_WORKFLOW_EXECUTION_MAX_WAITING',
  'TEMPORAL_API_KEY',
  'OUTPUT_API_PORT',
  'OUTPUT_API_SERVICE_NAME',
  'OUTPUT_CATALOG_ID',
  'OUTPUT_API_AUTH_TOKEN',
  'OUTPUT_AWS_REGION',
  'OUTPUT_AWS_ACCESS_KEY_ID',
  'OUTPUT_AWS_SECRET_ACCESS_KEY'
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

const loadConfigs = async () => {
  vi.resetModules();
  return import( '#configs' );
};

describe( 'configs', () => {
  beforeEach( () => clearEnv() );
  afterEach( () => clearEnv() );

  it( 'throws when OUTPUT_CATALOG_ID is missing', async () => {
    clearEnv();
    vi.resetModules();

    await expect( import( '#configs' ) ).rejects.toThrow();
  } );

  it( 'throws when OUTPUT_CATALOG_ID does not match regex', async () => {
    setEnv( { OUTPUT_CATALOG_ID: 'invalid space' } );
    vi.resetModules();

    await expect( import( '#configs' ) ).rejects.toThrow();
  } );

  it( 'uses defaults when only OUTPUT_CATALOG_ID is set', async () => {
    setEnv();
    const configs = await loadConfigs();

    expect( configs.temporal ).toEqual( {
      defaultTaskQueue: 'test-catalog',
      address: 'localhost:7233',
      apiKey: undefined,
      namespace: 'default',
      workflowExecutionTimeout: '24h',
      workflowExecutionMaxWaiting: 300_000
    } );
    expect( configs.api ).toEqual( {
      authToken: undefined,
      defaultCatalogWorkflow: 'test-catalog',
      port: 3000,
      serviceName: 'output-api',
      nodeEnv: 'development'
    } );
    expect( configs.aws ).toEqual( {
      region: 'us-west-1',
      accessKeyId: undefined,
      secretAccessKey: undefined
    } );
  } );

  it( 'parses custom env vars', async () => {
    setEnv( {
      TEMPORAL_ADDRESS: 'temporal:7233',
      TEMPORAL_NAMESPACE: 'my-ns',
      OUTPUT_API_PORT: '3001',
      OUTPUT_API_SERVICE_NAME: 'my-api',
      OUTPUT_API_AUTH_TOKEN: 'secret',
      OUTPUT_AWS_REGION: 'us-east-1'
    } );
    const configs = await loadConfigs();

    expect( configs.temporal.address ).toBe( 'temporal:7233' );
    expect( configs.temporal.namespace ).toBe( 'my-ns' );
    expect( configs.api.port ).toBe( 3001 );
    expect( configs.api.serviceName ).toBe( 'my-api' );
    expect( configs.api.authToken ).toBe( 'secret' );
    expect( configs.aws.region ).toBe( 'us-east-1' );
  } );

  it( 'coerces OUTPUT_API_PORT from string', async () => {
    setEnv( { OUTPUT_API_PORT: '4000' } );
    const configs = await loadConfigs();

    expect( configs.api.port ).toBe( 4000 );
  } );

  it( 'coerces TEMPORAL_WORKFLOW_EXECUTION_MAX_WAITING from string', async () => {
    setEnv( { TEMPORAL_WORKFLOW_EXECUTION_MAX_WAITING: '600000' } );
    const configs = await loadConfigs();

    expect( configs.temporal.workflowExecutionMaxWaiting ).toBe( 600_000 );
  } );

  it( 'throws in production when OUTPUT_API_AUTH_TOKEN is missing', async () => {
    setEnv( { NODE_ENV: 'production' } );
    vi.resetModules();

    await expect( import( '#configs' ) ).rejects.toThrow();
  } );

  it( 'loads in production when OUTPUT_API_AUTH_TOKEN is set', async () => {
    setEnv( { NODE_ENV: 'production', OUTPUT_API_AUTH_TOKEN: 'prod-token' } );
    const configs = await loadConfigs();

    expect( configs.isProduction ).toBe( true );
    expect( configs.api.authToken ).toBe( 'prod-token' );
  } );
} );
