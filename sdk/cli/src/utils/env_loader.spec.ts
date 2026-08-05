import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvironment } from './env_loader.js';

describe( 'loadEnvironment', () => {
  const mockCwd = mkdtempSync( join( tmpdir(), 'output-env-loader-' ) );

  beforeEach( () => {
    for ( const name of readdirSync( mockCwd ) ) {
      unlinkSync( join( mockCwd, name ) );
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
} );
