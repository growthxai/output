import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvironment } from './env_loader.js';

describe( 'loadEnvironment', () => {
  const mockCwd = mkdtempSync( join( tmpdir(), 'output-env-loader-' ) );

  beforeEach( () => {
    for ( const name of readdirSync( mockCwd ) ) {
      rmSync( join( mockCwd, name ), { recursive: true, force: true } );
    }
    vi.spyOn( process, 'cwd' ).mockReturnValue( mockCwd );
    vi.stubEnv( 'OUTPUT_CLI_ENV', undefined );
    vi.stubEnv( 'OUTPUT_API_URL', undefined );
    vi.stubEnv( 'OUTPUT_API_TOKEN', undefined );
  } );

  afterEach( () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  } );

  afterAll( () => {
    rmSync( mockCwd, { recursive: true, force: true } );
  } );

  it( 'loads variables from OUTPUT_CLI_ENV', () => {
    writeFileSync( join( mockCwd, '.env' ), [
      'OUTPUT_API_URL=https://default.api.com',
      'OUTPUT_API_TOKEN=default-token'
    ].join( '\n' ) );
    writeFileSync( join( mockCwd, '.env.mock' ), [
      'OUTPUT_API_URL=https://mock.api.com',
      'OUTPUT_API_TOKEN=mock-token'
    ].join( '\n' ) );
    process.env.OUTPUT_CLI_ENV = '.env.mock';

    loadEnvironment();

    expect( process.env.OUTPUT_API_URL ).toBe( 'https://mock.api.com' );
    expect( process.env.OUTPUT_API_TOKEN ).toBe( 'mock-token' );
  } );

  it( 'loads variables from .env by default', () => {
    writeFileSync( join( mockCwd, '.env' ), [
      'OUTPUT_API_URL=https://default.api.com',
      'OUTPUT_API_TOKEN=default-token'
    ].join( '\n' ) );
    writeFileSync( join( mockCwd, '.env.mock' ), [
      'OUTPUT_API_URL=https://mock.api.com',
      'OUTPUT_API_TOKEN=mock-token'
    ].join( '\n' ) );

    loadEnvironment();

    expect( process.env.OUTPUT_API_URL ).toBe( 'https://default.api.com' );
    expect( process.env.OUTPUT_API_TOKEN ).toBe( 'default-token' );
  } );

  it( 'does nothing when the env file is missing', () => {
    expect( () => loadEnvironment() ).not.toThrow();
    expect( process.env.OUTPUT_API_URL ).toBeUndefined();
    expect( process.env.OUTPUT_API_TOKEN ).toBeUndefined();
  } );

  it( 'does not throw when the env path is not a readable file', () => {
    mkdirSync( join( mockCwd, 'not-a-file.env' ) );
    process.env.OUTPUT_CLI_ENV = 'not-a-file.env';

    expect( () => loadEnvironment() ).not.toThrow();
    expect( process.env.OUTPUT_API_URL ).toBeUndefined();
  } );

  it( 'does not overwrite already-set process.env values', () => {
    vi.stubEnv( 'OUTPUT_API_URL', 'https://ambient.api.com' );
    writeFileSync( join( mockCwd, '.env' ), [
      'OUTPUT_API_URL=https://file.api.com',
      'OUTPUT_API_TOKEN=file-token'
    ].join( '\n' ) );

    loadEnvironment();

    expect( process.env.OUTPUT_API_URL ).toBe( 'https://ambient.api.com' );
    expect( process.env.OUTPUT_API_TOKEN ).toBe( 'file-token' );
  } );
} );
