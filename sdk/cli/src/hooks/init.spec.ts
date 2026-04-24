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
    await hook.call( ctx as any, { argv: [], id: undefined } as any );

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
    await hook.call( ctx as any, { argv: [], id: undefined } as any );

    expect( ux.stdout ).not.toHaveBeenCalled();
  } );

  it( 'should silently handle errors', async () => {
    vi.mocked( checkForUpdate ).mockRejectedValue( new Error( 'network failure' ) );

    const ctx = createHookContext();
    await hook.call( ctx as any, { argv: [], id: undefined } as any );

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

    it( 'should mutate opts.argv in place to strip --yes', async () => {
      process.argv = [ 'node', 'run.js', 'init', '--yes', 'my-project' ];
      const optsArgv = [ '--yes', 'my-project' ];
      const argvRef = optsArgv;

      const ctx = createHookContext();
      await hook.call( ctx as any, { argv: optsArgv, id: 'init' } as any );

      expect( setNonInteractive ).toHaveBeenCalledWith( true );
      // Same reference — oclif forwards this array to the command parser.
      expect( optsArgv ).toBe( argvRef );
      expect( optsArgv ).toEqual( [ 'my-project' ] );
      expect( process.argv ).toEqual( [ 'node', 'run.js', 'init', 'my-project' ] );
    } );

    it( 'should mutate opts.argv in place to strip --non-interactive', async () => {
      process.argv = [ 'node', 'run.js', 'init', '--non-interactive' ];
      const optsArgv = [ '--non-interactive' ];

      const ctx = createHookContext();
      await hook.call( ctx as any, { argv: optsArgv, id: 'init' } as any );

      expect( setNonInteractive ).toHaveBeenCalledWith( true );
      expect( optsArgv ).toEqual( [] );
      expect( process.argv ).toEqual( [ 'node', 'run.js', 'init' ] );
    } );

    it( 'should leave argv untouched when no global flag is present', async () => {
      process.argv = [ 'node', 'run.js', 'init', '--skip-env' ];
      const optsArgv = [ '--skip-env' ];

      const ctx = createHookContext();
      await hook.call( ctx as any, { argv: optsArgv, id: 'init' } as any );

      expect( setNonInteractive ).not.toHaveBeenCalled();
      expect( optsArgv ).toEqual( [ '--skip-env' ] );
      expect( process.argv ).toEqual( [ 'node', 'run.js', 'init', '--skip-env' ] );
    } );
  } );
} );
