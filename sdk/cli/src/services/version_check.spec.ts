import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readCachedResult, refreshVersionCheck, runRefresh, spawnBackgroundRefresh } from './version_check.js';
import { fetchLatestVersion, isOutdated } from '#services/npm_update_service.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';

vi.mock( '#services/npm_update_service.js', () => ( {
  fetchLatestVersion: vi.fn(),
  isOutdated: vi.fn()
} ) );

vi.mock( 'node:fs/promises', () => ( {
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn()
} ) );

vi.mock( 'node:child_process', () => ( {
  spawn: vi.fn()
} ) );

describe( 'version_check', () => {
  const cacheDir = '/tmp/test-cache';

  beforeEach( () => {
    vi.clearAllMocks();
  } );

  describe( 'readCachedResult', () => {
    it( 'should return cached result when cache is fresh', async () => {
      const cached = {
        timestamp: Date.now() - 1000,
        result: { updateAvailable: true, currentVersion: '0.8.4', latestVersion: '1.0.0' }
      };
      vi.mocked( readFile ).mockResolvedValue( JSON.stringify( cached ) );

      const result = await readCachedResult( '0.8.4', cacheDir );

      expect( result ).toEqual( cached.result );
    } );

    it( 'should return null when cache is expired', async () => {
      const cached = {
        timestamp: Date.now() - ( 5 * 60 * 60 * 1000 ), // 5 hours ago
        result: { updateAvailable: true, currentVersion: '0.8.4', latestVersion: '0.9.0' }
      };
      vi.mocked( readFile ).mockResolvedValue( JSON.stringify( cached ) );

      expect( await readCachedResult( '0.8.4', cacheDir ) ).toBeNull();
    } );

    it( 'should return null when cached version differs from current', async () => {
      const cached = {
        timestamp: Date.now() - 1000,
        result: { updateAvailable: true, currentVersion: '0.8.4', latestVersion: '1.0.0' }
      };
      vi.mocked( readFile ).mockResolvedValue( JSON.stringify( cached ) );

      expect( await readCachedResult( '0.9.0', cacheDir ) ).toBeNull();
    } );

    it( 'should return null when cache file is missing', async () => {
      vi.mocked( readFile ).mockRejectedValue( new Error( 'ENOENT' ) );

      expect( await readCachedResult( '0.8.4', cacheDir ) ).toBeNull();
    } );

    it( 'should return null when cache file is corrupt', async () => {
      vi.mocked( readFile ).mockResolvedValue( 'not json' );

      expect( await readCachedResult( '0.8.4', cacheDir ) ).toBeNull();
    } );
  } );

  describe( 'refreshVersionCheck', () => {
    it( 'should write comparison result to the cache', async () => {
      vi.mocked( fetchLatestVersion ).mockResolvedValue( '1.0.0' );
      vi.mocked( isOutdated ).mockReturnValue( true );

      await refreshVersionCheck( '0.8.4', cacheDir );

      expect( mkdir ).toHaveBeenCalledWith( cacheDir, { recursive: true } );
      expect( writeFile ).toHaveBeenCalledTimes( 1 );

      const written = JSON.parse( vi.mocked( writeFile ).mock.calls[0][1] as string );
      expect( written.result ).toEqual( {
        updateAvailable: true,
        currentVersion: '0.8.4',
        latestVersion: '1.0.0'
      } );
      // A missing/invalid timestamp would make the cache immortal (NaN > TTL is false)
      expect( written.timestamp ).toBeCloseTo( Date.now(), -3 );
    } );

    it( 'should skip the cache write when fetch fails so the next invocation retries', async () => {
      vi.mocked( fetchLatestVersion ).mockResolvedValue( null );

      await refreshVersionCheck( '0.8.4', cacheDir );

      expect( isOutdated ).not.toHaveBeenCalled();
      expect( writeFile ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'runRefresh', () => {
    it( 'should refresh the cache from argv in spawn order (script, currentVersion, cacheDir)', async () => {
      vi.mocked( fetchLatestVersion ).mockResolvedValue( '1.0.0' );
      vi.mocked( isOutdated ).mockReturnValue( true );

      const exitCode = await runRefresh( [ 'node', 'refresh_version_check.js', '0.8.4', cacheDir ] );

      expect( exitCode ).toBe( 0 );
      expect( mkdir ).toHaveBeenCalledWith( cacheDir, { recursive: true } );
      const written = JSON.parse( vi.mocked( writeFile ).mock.calls[0][1] as string );
      expect( written.result.currentVersion ).toBe( '0.8.4' );
      expect( written.result.latestVersion ).toBe( '1.0.0' );
    } );

    it( 'should exit non-zero with usage on missing args without fetching', async () => {
      const errorSpy = vi.spyOn( console, 'error' ).mockImplementation( () => {} );

      const exitCode = await runRefresh( [ 'node', 'refresh_version_check.js' ] );

      expect( exitCode ).toBe( 1 );
      expect( errorSpy ).toHaveBeenCalledWith( expect.stringContaining( 'Usage:' ) );
      expect( fetchLatestVersion ).not.toHaveBeenCalled();
      expect( writeFile ).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    } );
  } );

  describe( 'spawnBackgroundRefresh', () => {
    it( 'should spawn a detached unref-ed helper with version and cache dir args', () => {
      const unref = vi.fn();
      vi.mocked( spawn ).mockReturnValue( { unref } as never );

      spawnBackgroundRefresh( '0.8.4', cacheDir );

      expect( spawn ).toHaveBeenCalledWith(
        process.execPath,
        [ expect.stringContaining( 'refresh_version_check.js' ), '0.8.4', cacheDir ],
        { detached: true, stdio: 'ignore' }
      );
      expect( unref ).toHaveBeenCalled();
    } );

    it( 'should swallow spawn failures', () => {
      vi.mocked( spawn ).mockImplementation( () => {
        throw new Error( 'spawn failure' );
      } );

      expect( () => spawnBackgroundRefresh( '0.8.4', cacheDir ) ).not.toThrow();
    } );
  } );
} );
