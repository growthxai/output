import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  fetchLatestVersion,
  getGlobalInstalledVersion,
  getLocalInstalledPackages,
  getLocalInstalledVersion,
  updateLocal,
  isOutdated
} from './npm_update_service.js';

const { mockExecFile, mockReadFile, mockSpawn } = vi.hoisted( () => ( {
  mockExecFile: vi.fn(),
  mockReadFile: vi.fn(),
  mockSpawn: vi.fn()
} ) );

vi.mock( 'node:child_process', () => ( {
  execFile: vi.fn(),
  spawn: mockSpawn
} ) );

vi.mock( 'node:util', () => ( {
  promisify: vi.fn( () => mockExecFile )
} ) );

const mockFetch = vi.fn();
vi.stubGlobal( 'fetch', mockFetch );

vi.mock( 'node:fs/promises', () => ( {
  readFile: mockReadFile
} ) );

describe( 'npm_update_service', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    mockReadFile.mockResolvedValue( JSON.stringify( { dependencies: {} } ) );
  } );

  describe( 'fetchLatestVersion', () => {
    it( 'should return version from the registry response', async () => {
      mockFetch.mockResolvedValue( {
        ok: true,
        json: async () => ( { version: '1.2.3' } )
      } );

      const result = await fetchLatestVersion();
      expect( result ).toBe( '1.2.3' );
      expect( mockFetch ).toHaveBeenCalledWith(
        'https://registry.npmjs.org/@outputai/cli/latest',
        { signal: expect.any( AbortSignal ) }
      );
    } );

    it( 'should return null on non-ok response', async () => {
      mockFetch.mockResolvedValue( { ok: false, status: 404 } );

      const result = await fetchLatestVersion();
      expect( result ).toBeNull();
    } );

    it( 'should return null when response has no version', async () => {
      mockFetch.mockResolvedValue( {
        ok: true,
        json: async () => ( {} )
      } );

      const result = await fetchLatestVersion();
      expect( result ).toBeNull();
    } );

    it( 'should return null on network failure or timeout', async () => {
      mockFetch.mockRejectedValue( new Error( 'aborted' ) );

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

  describe( 'getLocalInstalledPackages', () => {
    it( 'should return directly installed Output SDK package versions', async () => {
      mockReadFile.mockResolvedValue( JSON.stringify( {
        dependencies: {
          '@outputai/cli': '0.8.3',
          '@outputai/core': '0.8.3',
          'other-package': '1.0.0'
        },
        devDependencies: {
          '@outputai/llm': '0.8.3'
        }
      } ) );
      mockExecFile.mockImplementation( async ( _command, args ) => {
        const packageName = args[1];
        return {
          stdout: JSON.stringify( {
            dependencies: { [packageName]: { version: '0.8.3' } }
          } )
        };
      } );

      const result = await getLocalInstalledPackages( '/some/project' );

      expect( result ).toEqual( [
        { name: '@outputai/cli', version: '0.8.3' },
        { name: '@outputai/core', version: '0.8.3' },
        { name: '@outputai/llm', version: '0.8.3' }
      ] );
      expect( mockExecFile ).toHaveBeenCalledWith(
        'npm', [ 'ls', '@outputai/cli', '--json' ], { cwd: '/some/project' }
      );
      expect( mockExecFile ).toHaveBeenCalledWith(
        'npm', [ 'ls', '@outputai/core', '--json' ], { cwd: '/some/project' }
      );
      expect( mockExecFile ).toHaveBeenCalledWith(
        'npm', [ 'ls', '@outputai/llm', '--json' ], { cwd: '/some/project' }
      );
    } );

    it( 'should return an empty list when package.json cannot be read', async () => {
      mockReadFile.mockRejectedValue( new Error( 'missing package.json' ) );

      const result = await getLocalInstalledPackages( '/some/project' );

      expect( result ).toEqual( [] );
      expect( mockExecFile ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'updateLocal', () => {
    it( 'should install local packages at the target version exactly', async () => {
      const proc = new EventEmitter();
      mockSpawn.mockReturnValue( proc );

      const promise = updateLocal( '/some/project', [ '@outputai/cli', '@outputai/core' ], '1.0.0' );
      proc.emit( 'close', 0 );
      await promise;

      expect( mockSpawn ).toHaveBeenCalledWith(
        'npm',
        [ 'install', '--ignore-scripts', '--save-exact', '@outputai/cli@1.0.0', '@outputai/core@1.0.0' ],
        { cwd: '/some/project', stdio: 'inherit' }
      );
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
