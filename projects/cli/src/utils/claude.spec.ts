import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isClaudeCliAvailable, executeClaudeCommand } from './claude.js';
import { spawnSync } from 'node:child_process';
import * as processModule from './process.js';

vi.mock( 'node:child_process', () => ( {
  spawnSync: vi.fn()
} ) );

vi.mock( './process.js', () => ( {
  executeCommand: vi.fn()
} ) );

describe( 'claude utilities', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  describe( 'isClaudeCliAvailable', () => {
    it( 'should return true when claude CLI is available', () => {
      vi.mocked( spawnSync ).mockReturnValue( {
        status: 0,
        stdout: 'claude 1.0.0',
        stderr: '',
        pid: 1234,
        output: [],
        signal: null
      } );

      const result = isClaudeCliAvailable();

      expect( result ).toBe( true );
      expect( spawnSync ).toHaveBeenCalledWith(
        'claude',
        [ '--version' ],
        { encoding: 'utf8' }
      );
    } );

    it( 'should return false when claude CLI is not found', () => {
      vi.mocked( spawnSync ).mockReturnValue( {
        status: 1,
        stdout: '',
        stderr: 'command not found',
        pid: 1234,
        output: [],
        signal: null
      } );

      const result = isClaudeCliAvailable();

      expect( result ).toBe( false );
    } );

    it( 'should return false when status is null', () => {
      vi.mocked( spawnSync ).mockReturnValue( {
        status: null,
        stdout: '',
        stderr: '',
        pid: 1234,
        output: [],
        signal: 'SIGTERM'
      } );

      const result = isClaudeCliAvailable();

      expect( result ).toBe( false );
    } );
  } );

  describe( 'executeClaudeCommand', () => {
    it( 'should throw error when Claude CLI is not available', async () => {
      vi.mocked( spawnSync ).mockReturnValue( {
        status: 1,
        stdout: '',
        stderr: '',
        pid: 1234,
        output: [],
        signal: null
      } );

      await expect( executeClaudeCommand( [ 'plugin', 'list' ], '/test' ) )
        .rejects.toThrow( 'Claude CLI not found' );

      expect( processModule.executeCommand ).not.toHaveBeenCalled();
    } );

    it( 'should call executeCommand with correct arguments when CLI is available', async () => {
      vi.mocked( spawnSync ).mockReturnValue( {
        status: 0,
        stdout: '',
        stderr: '',
        pid: 1234,
        output: [],
        signal: null
      } );
      vi.mocked( processModule.executeCommand ).mockResolvedValue( { stderr: [] } );

      await executeClaudeCommand( [ 'plugin', 'install', 'test' ], '/project' );

      expect( processModule.executeCommand ).toHaveBeenCalledWith(
        'claude',
        [ 'plugin', 'install', 'test' ],
        '/project'
      );
    } );

    it( 'should propagate errors when ignoreFailure is not set', async () => {
      vi.mocked( spawnSync ).mockReturnValue( {
        status: 0,
        stdout: '',
        stderr: '',
        pid: 1234,
        output: [],
        signal: null
      } );
      vi.mocked( processModule.executeCommand ).mockRejectedValue(
        new Error( 'Command failed' )
      );

      await expect( executeClaudeCommand( [ 'plugin', 'list' ], '/test' ) )
        .rejects.toThrow( 'Command failed' );
    } );

    it( 'should suppress errors when ignoreFailure is true', async () => {
      vi.mocked( spawnSync ).mockReturnValue( {
        status: 0,
        stdout: '',
        stderr: '',
        pid: 1234,
        output: [],
        signal: null
      } );
      vi.mocked( processModule.executeCommand ).mockRejectedValue(
        new Error( 'Command failed' )
      );

      await expect(
        executeClaudeCommand( [ 'plugin', 'list' ], '/test', { ignoreFailure: true } )
      ).resolves.toBeUndefined();
    } );

    it( 'should not suppress errors when ignoreFailure is false', async () => {
      vi.mocked( spawnSync ).mockReturnValue( {
        status: 0,
        stdout: '',
        stderr: '',
        pid: 1234,
        output: [],
        signal: null
      } );
      vi.mocked( processModule.executeCommand ).mockRejectedValue(
        new Error( 'Command failed' )
      );

      await expect(
        executeClaudeCommand( [ 'plugin', 'list' ], '/test', { ignoreFailure: false } )
      ).rejects.toThrow( 'Command failed' );
    } );
  } );
} );
