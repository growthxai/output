/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkForUpdate } from '#services/version_check.js';
import { setNonInteractive } from '#utils/interactive.js';

vi.mock( '#services/version_check.js', () => ( {
  checkForUpdate: vi.fn()
} ) );

vi.mock( '#utils/interactive.js', () => ( {
  setNonInteractive: vi.fn()
} ) );

vi.mock( '@oclif/core', () => ( {
  ux: {
    stdout: vi.fn(),
    colorize: vi.fn( ( _color: string, text: string ) => text )
  }
} ) );

import { ux } from '@oclif/core';
import hook from './init.js';

describe( 'init hook', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  const createHookContext = ( version = '0.8.4' ) => ( {
    config: { version, cacheDir: '/tmp/test-cache' }
  } );

  it( 'should display warning when update is available', async () => {
    vi.mocked( checkForUpdate ).mockResolvedValue( {
      updateAvailable: true,
      currentVersion: '0.8.4',
      latestVersion: '1.0.0'
    } );

    const ctx = createHookContext();
    await hook.call( ctx as any, {} as any );

    expect( checkForUpdate ).toHaveBeenCalledWith( '0.8.4', '/tmp/test-cache' );
    expect( ux.stdout ).toHaveBeenCalled();

    const output = vi.mocked( ux.stdout ).mock.calls.map( c => c[0] ).join( '\n' );
    expect( output ).toContain( 'Uhoh' );
    expect( output ).toContain( 'v1.0.0' );
    expect( output ).toContain( 'v0.8.4' );
    expect( output ).toContain( 'npx output update' );
  } );

  it( 'should not display anything when up to date', async () => {
    vi.mocked( checkForUpdate ).mockResolvedValue( {
      updateAvailable: false,
      currentVersion: '0.8.4',
      latestVersion: '0.8.4'
    } );

    const ctx = createHookContext();
    await hook.call( ctx as any, {} as any );

    expect( ux.stdout ).not.toHaveBeenCalled();
  } );

  it( 'should silently handle errors', async () => {
    vi.mocked( checkForUpdate ).mockRejectedValue( new Error( 'network failure' ) );

    const ctx = createHookContext();
    await hook.call( ctx as any, {} as any );

    expect( ux.stdout ).not.toHaveBeenCalled();
  } );

  describe( 'global interactive flags', () => {
    const originalArgv = process.argv;

    beforeEach( () => {
      vi.mocked( checkForUpdate ).mockResolvedValue( {
        updateAvailable: false,
        currentVersion: '0.8.4',
        latestVersion: '0.8.4'
      } );
    } );

    afterEach( () => {
      process.argv = originalArgv;
    } );

    it( 'should strip --yes from process.argv and flip non-interactive', async () => {
      process.argv = [ 'node', 'run.js', 'init', '--yes', 'my-project' ];

      const ctx = createHookContext();
      await hook.call( ctx as any, {} as any );

      expect( setNonInteractive ).toHaveBeenCalledWith( true );
      expect( process.argv ).toEqual( [ 'node', 'run.js', 'init', 'my-project' ] );
    } );

    it( 'should strip --non-interactive from process.argv and flip non-interactive', async () => {
      process.argv = [ 'node', 'run.js', 'init', '--non-interactive' ];

      const ctx = createHookContext();
      await hook.call( ctx as any, {} as any );

      expect( setNonInteractive ).toHaveBeenCalledWith( true );
      expect( process.argv ).toEqual( [ 'node', 'run.js', 'init' ] );
    } );

    it( 'should leave process.argv untouched when no global flag is present', async () => {
      process.argv = [ 'node', 'run.js', 'init', '--skip-env' ];

      const ctx = createHookContext();
      await hook.call( ctx as any, {} as any );

      expect( setNonInteractive ).not.toHaveBeenCalled();
      expect( process.argv ).toEqual( [ 'node', 'run.js', 'init', '--skip-env' ] );
    } );
  } );
} );
