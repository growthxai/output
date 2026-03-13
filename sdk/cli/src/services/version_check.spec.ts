import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkForUpdate } from './version_check.js';
import { fetchLatestVersion, isOutdated } from '#services/npm_update_service.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

vi.mock( '#services/npm_update_service.js', () => ( {
  fetchLatestVersion: vi.fn(),
  isOutdated: vi.fn()
} ) );

vi.mock( 'node:fs/promises', () => ( {
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn()
} ) );

describe( 'version_check', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  describe( 'checkForUpdate', () => {
    it( 'should return updateAvailable true when outdated', async () => {
      vi.mocked( fetchLatestVersion ).mockResolvedValue( '1.0.0' );
      vi.mocked( isOutdated ).mockReturnValue( true );

      const result = await checkForUpdate( '0.8.4' );

      expect( result ).toEqual( {
        updateAvailable: true,
        currentVersion: '0.8.4',
        latestVersion: '1.0.0'
      } );
    } );

    it( 'should return updateAvailable false when up to date', async () => {
      vi.mocked( fetchLatestVersion ).mockResolvedValue( '0.8.4' );
      vi.mocked( isOutdated ).mockReturnValue( false );

      const result = await checkForUpdate( '0.8.4' );

      expect( result ).toEqual( {
        updateAvailable: false,
        currentVersion: '0.8.4',
        latestVersion: '0.8.4'
      } );
    } );

    it( 'should return updateAvailable false when fetch fails', async () => {
      vi.mocked( fetchLatestVersion ).mockResolvedValue( null );

      const result = await checkForUpdate( '0.8.4' );

      expect( result.updateAvailable ).toBe( false );
      expect( isOutdated ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'caching', () => {
    const cacheDir = '/tmp/test-cache';

    it( 'should return cached result when cache is fresh', async () => {
      const cached = {
        timestamp: Date.now() - 1000,
        result: { updateAvailable: true, currentVersion: '0.8.4', latestVersion: '1.0.0' }
      };
      vi.mocked( readFile ).mockResolvedValue( JSON.stringify( cached ) );

      const result = await checkForUpdate( '0.8.4', cacheDir );

      expect( result ).toEqual( cached.result );
      expect( fetchLatestVersion ).not.toHaveBeenCalled();
    } );

    it( 'should fetch fresh result when cache is expired', async () => {
      const cached = {
        timestamp: Date.now() - ( 5 * 60 * 60 * 1000 ), // 5 hours ago
        result: { updateAvailable: true, currentVersion: '0.8.4', latestVersion: '0.9.0' }
      };
      vi.mocked( readFile ).mockResolvedValue( JSON.stringify( cached ) );
      vi.mocked( fetchLatestVersion ).mockResolvedValue( '1.0.0' );
      vi.mocked( isOutdated ).mockReturnValue( true );

      const result = await checkForUpdate( '0.8.4', cacheDir );

      expect( fetchLatestVersion ).toHaveBeenCalled();
      expect( result.latestVersion ).toBe( '1.0.0' );
    } );

    it( 'should fetch fresh result when cached version differs from current', async () => {
      const cached = {
        timestamp: Date.now() - 1000,
        result: { updateAvailable: true, currentVersion: '0.8.4', latestVersion: '1.0.0' }
      };
      vi.mocked( readFile ).mockResolvedValue( JSON.stringify( cached ) );
      vi.mocked( fetchLatestVersion ).mockResolvedValue( '1.0.0' );
      vi.mocked( isOutdated ).mockReturnValue( true );

      const result = await checkForUpdate( '0.9.0', cacheDir );

      expect( fetchLatestVersion ).toHaveBeenCalled();
      expect( result.currentVersion ).toBe( '0.9.0' );
    } );

    it( 'should fetch fresh result when cache file is missing', async () => {
      vi.mocked( readFile ).mockRejectedValue( new Error( 'ENOENT' ) );
      vi.mocked( fetchLatestVersion ).mockResolvedValue( '1.0.0' );
      vi.mocked( isOutdated ).mockReturnValue( true );

      const result = await checkForUpdate( '0.8.4', cacheDir );

      expect( fetchLatestVersion ).toHaveBeenCalled();
      expect( result.latestVersion ).toBe( '1.0.0' );
    } );

    it( 'should write cache after fresh fetch', async () => {
      vi.mocked( readFile ).mockRejectedValue( new Error( 'ENOENT' ) );
      vi.mocked( fetchLatestVersion ).mockResolvedValue( '1.0.0' );
      vi.mocked( isOutdated ).mockReturnValue( true );

      await checkForUpdate( '0.8.4', cacheDir );

      expect( mkdir ).toHaveBeenCalledWith( cacheDir, { recursive: true } );
      expect( writeFile ).toHaveBeenCalled();
    } );

    it( 'should skip caching when no cacheDir provided', async () => {
      vi.mocked( fetchLatestVersion ).mockResolvedValue( '1.0.0' );
      vi.mocked( isOutdated ).mockReturnValue( true );

      await checkForUpdate( '0.8.4' );

      expect( readFile ).not.toHaveBeenCalled();
      expect( writeFile ).not.toHaveBeenCalled();
    } );
  } );
} );
