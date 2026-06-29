import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  fetchLatestVersion,
  getGlobalInstalledVersion,
  hasDeprecatedWrapperPackage,
  getLocalSdkPackages,
  getLocalInstalledVersion,
  updateLocal,
  updateLocalPackages,
  isOutdated,
  isPackageJsonVersionOutdated
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

  describe( 'getLocalSdkPackages', () => {
    it( 'should return directly declared Output SDK packages from package.json', async () => {
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

      const result = await getLocalSdkPackages( '/some/project' );

      expect( result ).toEqual( [
        { name: '@outputai/cli', version: '0.8.3', dependencyType: 'dependencies' },
        { name: '@outputai/core', version: '0.8.3', dependencyType: 'dependencies' },
        { name: '@outputai/llm', version: '0.8.3', dependencyType: 'devDependencies' }
      ] );
      expect( mockExecFile ).not.toHaveBeenCalled();
    } );

    it( 'should return an empty list when package.json cannot be read', async () => {
      mockReadFile.mockRejectedValue( new Error( 'missing package.json' ) );

      const result = await getLocalSdkPackages( '/some/project' );

      expect( result ).toEqual( [] );
      expect( mockExecFile ).not.toHaveBeenCalled();
    } );

    it( 'should not require installed node_modules to return package.json packages', async () => {
      mockReadFile.mockResolvedValue( JSON.stringify( {
        dependencies: {
          '@outputai/cli': '0.8.3',
          '@outputai/core': '^0.8.0'
        }
      } ) );
      mockExecFile.mockRejectedValue( new Error( 'missing node_modules' ) );

      const result = await getLocalSdkPackages( '/some/project' );

      expect( result ).toEqual( [
        { name: '@outputai/cli', version: '0.8.3', dependencyType: 'dependencies' },
        { name: '@outputai/core', version: '^0.8.0', dependencyType: 'dependencies' }
      ] );
      expect( mockExecFile ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'hasDeprecatedWrapperPackage', () => {
    it( 'should return true when package.json declares the deprecated wrapper package', async () => {
      mockReadFile.mockResolvedValue( JSON.stringify( {
        dependencies: {
          '@outputai/output': '0.9.0'
        }
      } ) );

      const result = await hasDeprecatedWrapperPackage( '/some/project' );

      expect( result ).toBe( true );
    } );

    it( 'should return false when package.json does not declare the deprecated wrapper package', async () => {
      mockReadFile.mockResolvedValue( JSON.stringify( {
        dependencies: {
          '@outputai/core': '0.9.0'
        }
      } ) );

      const result = await hasDeprecatedWrapperPackage( '/some/project' );

      expect( result ).toBe( false );
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

  describe( 'updateLocalPackages', () => {
    it( 'should preserve dependency sections when updating packages', async () => {
      mockSpawn.mockImplementation( () => {
        const proc = new EventEmitter();
        queueMicrotask( () => proc.emit( 'close', 0 ) );
        return proc;
      } );

      await updateLocalPackages( '/some/project', [
        { name: '@outputai/core', version: '0.8.3', dependencyType: 'dependencies' },
        { name: '@outputai/cli', version: '0.8.3', dependencyType: 'devDependencies' }
      ], '1.0.0' );

      expect( mockSpawn ).toHaveBeenCalledWith(
        'npm',
        [ 'install', '--ignore-scripts', '--save-exact', '@outputai/core@1.0.0' ],
        { cwd: '/some/project', stdio: 'inherit' }
      );
      expect( mockSpawn ).toHaveBeenCalledWith(
        'npm',
        [ 'install', '--ignore-scripts', '--save-dev', '--save-exact', '@outputai/cli@1.0.0' ],
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

  describe( 'isPackageJsonVersionOutdated', () => {
    it( 'should return false when package.json version satisfies latest', () => {
      expect( isPackageJsonVersionOutdated( '1.0.0', '1.0.0' ) ).toBe( false );
      expect( isPackageJsonVersionOutdated( '^1.0.0', '1.0.5' ) ).toBe( false );
    } );

    it( 'should return true when package.json version does not satisfy latest', () => {
      expect( isPackageJsonVersionOutdated( '0.8.1', '0.9.0' ) ).toBe( true );
      expect( isPackageJsonVersionOutdated( '^0.8.0', '0.9.0' ) ).toBe( true );
    } );

    it( 'should return false when package.json version is not a semver range', () => {
      expect( isPackageJsonVersionOutdated( 'workspace:', '1.0.0' ) ).toBe( false );
      expect( isPackageJsonVersionOutdated( 'file:../sdk/cli', '1.0.0' ) ).toBe( false );
    } );
  } );
} );
