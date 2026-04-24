import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { config } from '#config.js';

describe( 'config', () => {
  const envVars = [
    'OUTPUT_API_URL',
    'OUTPUT_API_HOST_PORT',
    'OUTPUT_TEMPORAL_HOST_PORT',
    'OUTPUT_TEMPORAL_UI_HOST_PORT',
    'OUTPUT_API_AUTH_TOKEN',
    'DOCKER_SERVICE_NAME',
    'OUTPUT_DEBUG',
    'OUTPUT_CLI_ENV',
    'OUTPUT_TRACE_REMOTE_S3_BUCKET',
    'OUTPUT_AWS_REGION',
    'OUTPUT_AWS_ACCESS_KEY_ID',
    'OUTPUT_AWS_SECRET_ACCESS_KEY'
  ] as const;

  const saved: Record<string, string | undefined> = {};

  beforeEach( () => {
    for ( const key of envVars ) {
      saved[key] = process.env[key];
    }
  } );

  afterEach( () => {
    for ( const key of envVars ) {
      if ( saved[key] === undefined ) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  } );

  it( 'reads env vars lazily, not at module evaluation time', () => {
    process.env.OUTPUT_API_URL = 'https://lazy-test.example.com';
    expect( config.apiUrl ).toBe( 'https://lazy-test.example.com' );

    process.env.OUTPUT_API_URL = 'https://changed.example.com';
    expect( config.apiUrl ).toBe( 'https://changed.example.com' );
  } );

  it( 'falls back to defaults when env vars are unset', () => {
    delete process.env.OUTPUT_API_URL;
    delete process.env.OUTPUT_API_HOST_PORT;
    delete process.env.OUTPUT_TEMPORAL_HOST_PORT;
    delete process.env.OUTPUT_TEMPORAL_UI_HOST_PORT;
    delete process.env.DOCKER_SERVICE_NAME;
    delete process.env.OUTPUT_DEBUG;
    delete process.env.OUTPUT_CLI_ENV;

    expect( config.apiUrl ).toBe( 'http://localhost:3001' );
    expect( config.ports ).toEqual( { temporal: 7233, temporalUi: 8080, api: 3001 } );
    expect( config.temporalUiUrl ).toBe( 'http://localhost:8080' );
    expect( config.dockerServiceName ).toBe( 'output-sdk' );
    expect( config.debugMode ).toBe( false );
    expect( config.envFile ).toBe( '.env' );
  } );

  it( 'derives apiUrl from OUTPUT_API_HOST_PORT when OUTPUT_API_URL is unset', () => {
    delete process.env.OUTPUT_API_URL;
    process.env.OUTPUT_API_HOST_PORT = '3002';
    expect( config.apiUrl ).toBe( 'http://localhost:3002' );
  } );

  it( 'OUTPUT_API_URL takes precedence over OUTPUT_API_HOST_PORT', () => {
    process.env.OUTPUT_API_URL = 'https://api.example.com';
    process.env.OUTPUT_API_HOST_PORT = '3002';
    expect( config.apiUrl ).toBe( 'https://api.example.com' );
  } );

  it( 'reads port overrides from env vars', () => {
    process.env.OUTPUT_TEMPORAL_HOST_PORT = '7234';
    process.env.OUTPUT_TEMPORAL_UI_HOST_PORT = '8081';
    process.env.OUTPUT_API_HOST_PORT = '3002';

    expect( config.ports ).toEqual( { temporal: 7234, temporalUi: 8081, api: 3002 } );
    expect( config.temporalUiUrl ).toBe( 'http://localhost:8081' );
  } );

  it( 'reads apiToken from env', () => {
    process.env.OUTPUT_API_AUTH_TOKEN = 'test-token-123';
    expect( config.apiToken ).toBe( 'test-token-123' );

    delete process.env.OUTPUT_API_AUTH_TOKEN;
    expect( config.apiToken ).toBeUndefined();
  } );

  it( 'reads debugMode as boolean', () => {
    process.env.OUTPUT_DEBUG = 'true';
    expect( config.debugMode ).toBe( true );

    process.env.OUTPUT_DEBUG = 'false';
    expect( config.debugMode ).toBe( false );
  } );

  it( 'reads s3 config lazily', () => {
    process.env.OUTPUT_TRACE_REMOTE_S3_BUCKET = 'my-bucket';
    process.env.OUTPUT_AWS_REGION = 'us-west-2';
    process.env.OUTPUT_AWS_ACCESS_KEY_ID = 'AKIA123';
    process.env.OUTPUT_AWS_SECRET_ACCESS_KEY = 'secret123';

    expect( config.s3 ).toEqual( {
      bucket: 'my-bucket',
      region: 'us-west-2',
      accessKeyId: 'AKIA123',
      secretAccessKey: 'secret123'
    } );
  } );

  it( 'has static properties that are not env-derived', () => {
    expect( config.requestTimeout ).toBe( 30000 );
    expect( config.agentConfigDir ).toBe( '.outputai' );
  } );
} );
