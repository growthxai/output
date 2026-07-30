import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvironment } from './env_loader.js';

describe( 'loadEnvironment', () => {
  const originalCwd = process.cwd();
  const mockCwd = mkdtempSync( join( tmpdir(), 'output-env-loader-' ) );
  const mockApiUrl = 'https://mock.api.com';
  const mockToken = 'mock-token';
  const mockEnvironment = [
    `OUTPUT_API_URL=${mockApiUrl}`,
    `OUTPUT_API_TOKEN=${mockToken}`
  ].join( '\n' );

  beforeEach( () => {
    process.chdir( mockCwd );
    vi.stubEnv( 'OUTPUT_CLI_ENV', undefined );
    vi.stubEnv( 'OUTPUT_API_URL', undefined );
    vi.stubEnv( 'OUTPUT_API_TOKEN', undefined );
  } );

  afterEach( () => {
    process.chdir( originalCwd );
    vi.unstubAllEnvs();
  } );

  afterAll( () => {
    rmSync( mockCwd, { recursive: true, force: true } );
  } );

  it( 'loads variables from OUTPUT_CLI_ENV', () => {
    writeFileSync( join( mockCwd, '.env.mock' ), mockEnvironment );
    process.env.OUTPUT_CLI_ENV = '.env.mock';

    loadEnvironment();

    expect( process.env.OUTPUT_API_URL ).toBe( mockApiUrl );
    expect( process.env.OUTPUT_API_TOKEN ).toBe( mockToken );
  } );

  it( 'loads variables from .env by default', () => {
    writeFileSync( join( mockCwd, '.env' ), mockEnvironment );

    loadEnvironment();

    expect( process.env.OUTPUT_API_URL ).toBe( mockApiUrl );
    expect( process.env.OUTPUT_API_TOKEN ).toBe( mockToken );
  } );
} );
