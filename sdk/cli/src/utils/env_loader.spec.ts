/**
 * Tests for the env loader utility
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import * as dotenv from 'dotenv';

vi.mock( 'node:fs' );
vi.mock( 'dotenv' );

describe( 'loadEnvironment', () => {
  const originalEnv = { ...process.env };
  const mockCwd = '/mock/project';

  beforeEach( () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn( process, 'cwd' ).mockReturnValue( mockCwd );
    vi.spyOn( console, 'log' ).mockImplementation( () => {} );
    vi.spyOn( console, 'warn' ).mockImplementation( () => {} );
  } );

  afterEach( () => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  } );

  it( 'should load from OUTPUT_CLI_ENV when set and file exists', async () => {
    process.env.OUTPUT_CLI_ENV = '.env.prod';
    const expectedPath = resolve( mockCwd, '.env.prod' );

    vi.mocked( existsSync ).mockReturnValue( true );
    vi.mocked( dotenv.config ).mockReturnValue( { parsed: { OUTPUT_API_URL: 'https://prod.api.com' } } );

    const { loadEnvironment } = await import( './env_loader.js' );
    loadEnvironment();

    expect( dotenv.config ).toHaveBeenCalledWith( { path: expectedPath, quiet: true } );
  } );

  it( 'should load .env by default and log', async () => {
    delete process.env.OUTPUT_CLI_ENV;
    const envPath = resolve( mockCwd, '.env' );

    vi.mocked( existsSync ).mockImplementation( p => p === envPath );
    vi.mocked( dotenv.config ).mockReturnValue( { parsed: {} } );

    const { loadEnvironment } = await import( './env_loader.js' );
    loadEnvironment();

    expect( dotenv.config ).toHaveBeenCalledTimes( 1 );
    expect( dotenv.config ).toHaveBeenCalledWith( { path: envPath, quiet: true } );
  } );
} );
