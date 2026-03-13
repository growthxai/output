/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkForUpdate } from '#services/version_check.js';

vi.mock( '#services/version_check.js', () => ( {
  checkForUpdate: vi.fn()
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
} );
