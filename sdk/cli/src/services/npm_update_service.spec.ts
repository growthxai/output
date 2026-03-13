import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fetchLatestVersion,
  getGlobalInstalledVersion,
  getLocalInstalledVersion,
  isOutdated
} from './npm_update_service.js';

const { mockExecFile } = vi.hoisted( () => ( { mockExecFile: vi.fn() } ) );

vi.mock( 'node:child_process', () => ( {
  execFile: vi.fn(),
  spawn: vi.fn()
} ) );

vi.mock( 'node:util', () => ( {
  promisify: vi.fn( () => mockExecFile )
} ) );

describe( 'npm_update_service', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  describe( 'fetchLatestVersion', () => {
    it( 'should return version from npm view output', async () => {
      mockExecFile.mockResolvedValue( { stdout: '1.2.3\n' } );

      const result = await fetchLatestVersion();
      expect( result ).toBe( '1.2.3' );
      expect( mockExecFile ).toHaveBeenCalledWith( 'npm', [ 'view', '@outputai/cli', 'version' ] );
    } );

    it( 'should return null on empty output', async () => {
      mockExecFile.mockResolvedValue( { stdout: '' } );

      const result = await fetchLatestVersion();
      expect( result ).toBeNull();
    } );

    it( 'should return null on whitespace-only output', async () => {
      mockExecFile.mockResolvedValue( { stdout: '  \n' } );

      const result = await fetchLatestVersion();
      expect( result ).toBeNull();
    } );
  } );

  describe( 'getGlobalInstalledVersion', () => {
    it( 'should parse version from npm ls -g output', async () => {
      const output = JSON.stringify( {
        dependencies: { '@outputai/cli': { version: '0.8.4' } }
      } );
      mockExecFile.mockResolvedValue( { stdout: output } );

      const result = await getGlobalInstalledVersion();
      expect( result ).toBe( '0.8.4' );
      expect( mockExecFile ).toHaveBeenCalledWith( 'npm', [ 'ls', '-g', '@outputai/cli', '--json' ] );
    } );

    it( 'should return null when not installed globally', async () => {
      mockExecFile.mockResolvedValue( { stdout: JSON.stringify( {} ) } );

      const result = await getGlobalInstalledVersion();
      expect( result ).toBeNull();
    } );

    it( 'should return null on invalid JSON', async () => {
      mockExecFile.mockResolvedValue( { stdout: 'not json' } );

      const result = await getGlobalInstalledVersion();
      expect( result ).toBeNull();
    } );
  } );

  describe( 'getLocalInstalledVersion', () => {
    it( 'should parse version from npm ls output', async () => {
      const output = JSON.stringify( {
        dependencies: { '@outputai/cli': { version: '0.8.3' } }
      } );
      mockExecFile.mockResolvedValue( { stdout: output } );

      const result = await getLocalInstalledVersion( '/some/project' );
      expect( result ).toBe( '0.8.3' );
      expect( mockExecFile ).toHaveBeenCalledWith(
        'npm', [ 'ls', '@outputai/cli', '--json' ], { cwd: '/some/project' }
      );
    } );

    it( 'should find version in transitive dependencies', async () => {
      const output = JSON.stringify( {
        dependencies: {
          '@outputai/output': {
            version: '0.2.0',
            dependencies: {
              '@outputai/cli': { version: '0.8.0' }
            }
          }
        }
      } );
      mockExecFile.mockResolvedValue( { stdout: output } );

      const result = await getLocalInstalledVersion( '/some/project' );
      expect( result ).toBe( '0.8.0' );
    } );

    it( 'should return null when not installed locally', async () => {
      mockExecFile.mockResolvedValue( { stdout: JSON.stringify( {} ) } );

      const result = await getLocalInstalledVersion( '/some/project' );
      expect( result ).toBeNull();
    } );
  } );

  describe( 'isOutdated', () => {
    it( 'should return true when latest is newer', () => {
      expect( isOutdated( '0.8.4', '0.8.5' ) ).toBe( true );
      expect( isOutdated( '0.8.4', '0.9.0' ) ).toBe( true );
      expect( isOutdated( '0.8.4', '1.0.0' ) ).toBe( true );
    } );

    it( 'should return false when versions are equal', () => {
      expect( isOutdated( '0.8.4', '0.8.4' ) ).toBe( false );
      expect( isOutdated( '1.0.0', '1.0.0' ) ).toBe( false );
    } );

    it( 'should return false when current is newer', () => {
      expect( isOutdated( '0.9.0', '0.8.4' ) ).toBe( false );
      expect( isOutdated( '1.0.0', '0.9.9' ) ).toBe( false );
    } );

    it( 'should handle prerelease versions', () => {
      expect( isOutdated( '1.0.0-beta.1', '1.0.0' ) ).toBe( true );
      expect( isOutdated( '1.0.0', '1.0.0-beta.1' ) ).toBe( false );
    } );
  } );
} );
