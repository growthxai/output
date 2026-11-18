import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { config } from '#config.js';
import { InvalidPortError } from '#utils/validation.js';

describe( 'config', () => {
  const envVars = [
    'OUTPUT_API_URL',
    'OUTPUT_API_HOST_PORT',
    'OUTPUT_TEMPORAL_UI_HOST_PORT',
    'OUTPUT_TEMPORAL_HOST_PORT',
    'OUTPUT_API_AUTH_TOKEN',
    'DOCKER_SERVICE_NAME',
    'OUTPUT_DEBUG',
    'OUTPUT_CLI_ENV'
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
    delete process.env.OUTPUT_TEMPORAL_UI_HOST_PORT;
    delete process.env.OUTPUT_TEMPORAL_HOST_PORT;
    delete process.env.DOCKER_SERVICE_NAME;
    delete process.env.OUTPUT_DEBUG;
    delete process.env.OUTPUT_CLI_ENV;

    expect( config.apiUrl ).toBe( 'http://localhost:3001' );
    expect( config.ports ).toEqual( { temporalUi: 8080, temporal: 7233, api: 3001 } );
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

  it( 'empty-string OUTPUT_API_URL falls through to OUTPUT_API_HOST_PORT (|| not ??)', () => {
    process.env.OUTPUT_API_URL = '';
    process.env.OUTPUT_API_HOST_PORT = '3002';
    expect( config.apiUrl ).toBe( 'http://localhost:3002' );
  } );

  it( 'reads port overrides from env vars', () => {
    process.env.OUTPUT_TEMPORAL_UI_HOST_PORT = '8081';
    process.env.OUTPUT_TEMPORAL_HOST_PORT = '7234';
    process.env.OUTPUT_API_HOST_PORT = '3002';

    expect( config.ports ).toEqual( { temporalUi: 8081, temporal: 7234, api: 3002 } );
    expect( config.temporalUiUrl ).toBe( 'http://localhost:8081' );
  } );

  it( 'treats empty-string port env vars as unset (matches Compose semantics)', () => {
    delete process.env.OUTPUT_API_URL;
    process.env.OUTPUT_API_HOST_PORT = '';
    process.env.OUTPUT_TEMPORAL_UI_HOST_PORT = '';
    process.env.OUTPUT_TEMPORAL_HOST_PORT = '';

    expect( config.apiUrl ).toBe( 'http://localhost:3001' );
    expect( config.ports ).toEqual( { temporalUi: 8080, temporal: 7233, api: 3001 } );
    expect( config.temporalUiUrl ).toBe( 'http://localhost:8080' );
  } );

  it( 'throws InvalidPortError on invalid OUTPUT_TEMPORAL_HOST_PORT', () => {
    process.env.OUTPUT_TEMPORAL_HOST_PORT = 'not-a-port';
    expect( () => config.ports ).toThrow( InvalidPortError );
  } );

  it( 'throws InvalidPortError on non-numeric port values', () => {
    delete process.env.OUTPUT_API_URL;
    process.env.OUTPUT_API_HOST_PORT = 'abc';
    expect( () => config.ports ).toThrow( InvalidPortError );
    expect( () => config.apiUrl ).toThrow( InvalidPortError );
  } );

  it( 'throws InvalidPortError on out-of-range port values', () => {
    process.env.OUTPUT_API_HOST_PORT = '99999';
    expect( () => config.ports ).toThrow( InvalidPortError );
  } );

  it( 'throws InvalidPortError on trailing-junk port values', () => {
    process.env.OUTPUT_TEMPORAL_UI_HOST_PORT = '8080abc';
    expect( () => config.ports ).toThrow( InvalidPortError );
  } );

  it( 'throws InvalidPortError on port 0 (Compose treats 0 as ephemeral - prevents CLI/Docker desync)', () => {
    process.env.OUTPUT_API_HOST_PORT = '0';
    expect( () => config.ports ).toThrow( InvalidPortError );
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

  it( 'has static properties that are not env-derived', () => {
    expect( config.requestTimeout ).toBe( 30000 );
    expect( config.agentConfigDir ).toBe( '.outputai' );
  } );
} );
