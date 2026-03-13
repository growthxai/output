import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

async function loadModule() {
  vi.resetModules();
  return import( './configs.js' );
}

describe( 'tracing/processors/s3/configs', () => {
  const required = {
    OUTPUT_AWS_REGION: 'us-east-1',
    OUTPUT_AWS_ACCESS_KEY_ID: 'id',
    OUTPUT_AWS_SECRET_ACCESS_KEY: 'sek',
    OUTPUT_TRACE_REMOTE_S3_BUCKET: 'bkt',
    OUTPUT_REDIS_URL: 'redis://localhost:6379'
  };

  beforeEach( () => {
    vi.stubEnv( 'OUTPUT_AWS_REGION', required.OUTPUT_AWS_REGION );
    vi.stubEnv( 'OUTPUT_AWS_ACCESS_KEY_ID', required.OUTPUT_AWS_ACCESS_KEY_ID );
    vi.stubEnv( 'OUTPUT_AWS_SECRET_ACCESS_KEY', required.OUTPUT_AWS_SECRET_ACCESS_KEY );
    vi.stubEnv( 'OUTPUT_TRACE_REMOTE_S3_BUCKET', required.OUTPUT_TRACE_REMOTE_S3_BUCKET );
    vi.stubEnv( 'OUTPUT_REDIS_URL', required.OUTPUT_REDIS_URL );
  } );

  afterEach( () => {
    vi.unstubAllEnvs();
  } );

  it( 'loadEnv() throws when required env vars are missing', async () => {
    vi.stubEnv( 'OUTPUT_REDIS_URL', undefined );
    const { loadEnv } = await loadModule();
    expect( () => loadEnv() ).toThrow( /OUTPUT_REDIS_URL/ );
  } );

  it( 'loadEnv() populates getVars() with parsed env', async () => {
    const { loadEnv, getVars } = await loadModule();
    loadEnv();
    const vars = getVars();
    expect( vars.awsRegion ).toBe( required.OUTPUT_AWS_REGION );
    expect( vars.awsAccessKeyId ).toBe( required.OUTPUT_AWS_ACCESS_KEY_ID );
    expect( vars.awsSecretAccessKey ).toBe( required.OUTPUT_AWS_SECRET_ACCESS_KEY );
    expect( vars.remoteS3Bucket ).toBe( required.OUTPUT_TRACE_REMOTE_S3_BUCKET );
    expect( vars.redisUrl ).toBe( required.OUTPUT_REDIS_URL );
    expect( vars.redisIncompleteWorkflowsTTL ).toBe( 60 * 60 * 24 * 7 );
  } );

  it( 'loadEnv() uses OUTPUT_REDIS_TRACE_TTL when set', async () => {
    vi.stubEnv( 'OUTPUT_REDIS_TRACE_TTL', '3600' );
    const { loadEnv, getVars } = await loadModule();
    loadEnv();
    expect( getVars().redisIncompleteWorkflowsTTL ).toBe( 3600 );
  } );

  it( 'getVars() throws when loadEnv() was not called', async () => {
    const { getVars } = await loadModule();
    expect( () => getVars() ).toThrow( 'Env vars not loaded. Use loadEnv() first.' );
  } );

  it( 'loadEnv() throws when OUTPUT_REDIS_TRACE_TTL is invalid', async () => {
    vi.stubEnv( 'OUTPUT_REDIS_TRACE_TTL', 'not-a-number' );
    const { loadEnv } = await loadModule();
    expect( () => loadEnv() ).toThrow();
  } );
} );
