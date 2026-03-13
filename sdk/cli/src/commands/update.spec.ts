/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Update from './update.js';
import {
  fetchLatestVersion,
  getGlobalInstalledVersion,
  getLocalInstalledVersion,
  updateGlobal,
  updateLocal,
  isOutdated
} from '#services/npm_update_service.js';
import { ensureClaudePlugin } from '#services/coding_agents.js';
import { confirm } from '@inquirer/prompts';

vi.mock( '#services/npm_update_service.js', () => ( {
  fetchLatestVersion: vi.fn(),
  getGlobalInstalledVersion: vi.fn(),
  getLocalInstalledVersion: vi.fn(),
  updateGlobal: vi.fn(),
  updateLocal: vi.fn(),
  isOutdated: vi.fn()
} ) );

vi.mock( '#services/coding_agents.js', () => ( {
  ensureClaudePlugin: vi.fn()
} ) );

vi.mock( '@inquirer/prompts', () => ( {
  confirm: vi.fn()
} ) );

describe( 'update command', () => {
  const createTestCommand = ( flags: Record<string, boolean> = {} ) => {
    const cmd = new Update( [], {} as any );
    cmd.log = vi.fn();
    cmd.warn = vi.fn();
    cmd.error = vi.fn() as any;
    ( cmd as any ).debug = vi.fn();
    ( cmd as any ).parse = vi.fn().mockResolvedValue( { flags, args: {} } );
    return cmd;
  };

  beforeEach( () => {
    vi.clearAllMocks();
    vi.mocked( fetchLatestVersion ).mockResolvedValue( '1.0.0' );
    vi.mocked( getGlobalInstalledVersion ).mockResolvedValue( '0.8.4' );
    vi.mocked( getLocalInstalledVersion ).mockResolvedValue( null );
    vi.mocked( isOutdated ).mockReturnValue( true );
    vi.mocked( confirm ).mockResolvedValue( true );
    vi.mocked( updateGlobal ).mockResolvedValue();
    vi.mocked( updateLocal ).mockResolvedValue();
    vi.mocked( ensureClaudePlugin ).mockResolvedValue();
  } );

  describe( 'command structure', () => {
    it( 'should have correct description', () => {
      expect( Update.description ).toContain( 'Update Output CLI' );
    } );

    it( 'should have cli and agents flags', () => {
      expect( Update.flags ).toHaveProperty( 'cli' );
      expect( Update.flags ).toHaveProperty( 'agents' );
    } );
  } );

  describe( 'no flags (update all)', () => {
    it( 'should update cli and agents when no flags provided', async () => {
      vi.mocked( getGlobalInstalledVersion )
        .mockResolvedValueOnce( '0.8.4' )
        .mockResolvedValueOnce( '1.0.0' );

      const cmd = createTestCommand();
      await cmd.run();

      expect( fetchLatestVersion ).toHaveBeenCalled();
      expect( ensureClaudePlugin ).toHaveBeenCalledTimes( 1 );
    } );
  } );

  describe( '--cli flag', () => {
    it( 'should only update cli when --cli flag is set', async () => {
      vi.mocked( getGlobalInstalledVersion )
        .mockResolvedValueOnce( '0.8.4' )
        .mockResolvedValueOnce( '1.0.0' );

      const cmd = createTestCommand( { cli: true } );
      await cmd.run();

      expect( fetchLatestVersion ).toHaveBeenCalled();
      expect( ensureClaudePlugin ).not.toHaveBeenCalled();
    } );
  } );

  describe( '--agents flag', () => {
    it( 'should only update agents when --agents flag is set', async () => {
      const cmd = createTestCommand( { agents: true } );
      await cmd.run();

      expect( fetchLatestVersion ).not.toHaveBeenCalled();
      expect( ensureClaudePlugin ).toHaveBeenCalledTimes( 1 );
      expect( cmd.log ).toHaveBeenCalledWith( expect.stringContaining( 'agent configuration updated' ) );
    } );

    it( 'should warn on agent update failure', async () => {
      vi.mocked( ensureClaudePlugin ).mockRejectedValue( new Error( 'agent error' ) );

      const cmd = createTestCommand( { agents: true } );
      await cmd.run();

      expect( cmd.warn ).toHaveBeenCalledWith( expect.stringContaining( 'Failed to update agent' ) );
    } );
  } );

  describe( 'fetch failure', () => {
    it( 'should error when cannot fetch latest version', async () => {
      vi.mocked( fetchLatestVersion ).mockResolvedValue( null );

      const cmd = createTestCommand( { cli: true } );
      await cmd.run();

      expect( cmd.error ).toHaveBeenCalledWith(
        expect.stringContaining( 'Could not fetch' )
      );
    } );
  } );

  describe( 'global update', () => {
    it( 'should prompt and update global install when outdated', async () => {
      vi.mocked( getGlobalInstalledVersion )
        .mockResolvedValueOnce( '0.8.4' )
        .mockResolvedValueOnce( '1.0.0' );

      const cmd = createTestCommand( { cli: true } );
      await cmd.run();

      expect( confirm ).toHaveBeenCalledWith(
        expect.objectContaining( { message: expect.stringContaining( 'v0.8.4' ) } )
      );
      expect( updateGlobal ).toHaveBeenCalled();
      expect( cmd.log ).toHaveBeenCalledWith( expect.stringContaining( 'v1.0.0' ) );
    } );

    it( 'should skip global update when user declines', async () => {
      vi.mocked( confirm ).mockResolvedValue( false );

      const cmd = createTestCommand( { cli: true } );
      await cmd.run();

      expect( updateGlobal ).not.toHaveBeenCalled();
    } );

    it( 'should show up-to-date when global is current', async () => {
      vi.mocked( isOutdated ).mockReturnValue( false );

      const cmd = createTestCommand( { cli: true } );
      await cmd.run();

      expect( cmd.log ).toHaveBeenCalledWith( expect.stringContaining( 'up to date' ) );
      expect( updateGlobal ).not.toHaveBeenCalled();
    } );

    it( 'should show not found when global is not installed', async () => {
      vi.mocked( getGlobalInstalledVersion ).mockResolvedValue( null );

      const cmd = createTestCommand( { cli: true } );
      await cmd.run();

      expect( cmd.log ).toHaveBeenCalledWith( expect.stringContaining( 'not found' ) );
    } );

    it( 'should handle null version after global update', async () => {
      vi.mocked( getGlobalInstalledVersion )
        .mockResolvedValueOnce( '0.8.4' )
        .mockResolvedValueOnce( null );

      const cmd = createTestCommand( { cli: true } );
      await cmd.run();

      expect( updateGlobal ).toHaveBeenCalled();
      expect( cmd.log ).toHaveBeenCalledWith(
        expect.stringContaining( 'could not verify' )
      );
    } );

    it( 'should warn on global update failure', async () => {
      vi.mocked( updateGlobal ).mockRejectedValue( new Error( 'permission denied' ) );

      const cmd = createTestCommand( { cli: true } );
      await cmd.run();

      expect( cmd.warn ).toHaveBeenCalledWith(
        expect.stringContaining( 'Failed to update global' )
      );
    } );
  } );

  describe( 'local update', () => {
    it( 'should prompt and update local install when outdated', async () => {
      vi.mocked( getLocalInstalledVersion )
        .mockResolvedValueOnce( '0.8.3' )
        .mockResolvedValueOnce( '1.0.0' );
      vi.mocked( isOutdated )
        .mockReturnValueOnce( true )
        .mockReturnValueOnce( true )
        .mockReturnValueOnce( false );

      const cmd = createTestCommand( { cli: true } );
      await cmd.run();

      expect( updateLocal ).toHaveBeenCalled();
    } );

    it( 'should handle null version after local update', async () => {
      vi.mocked( getGlobalInstalledVersion ).mockResolvedValue( null );
      vi.mocked( getLocalInstalledVersion )
        .mockResolvedValueOnce( '0.8.3' )
        .mockResolvedValueOnce( null );

      const cmd = createTestCommand( { cli: true } );
      await cmd.run();

      expect( updateLocal ).toHaveBeenCalled();
      expect( cmd.log ).toHaveBeenCalledWith(
        expect.stringContaining( 'could not verify' )
      );
    } );

    it( 'should warn about package.json constraint when post-update version < latest', async () => {
      vi.mocked( getLocalInstalledVersion )
        .mockResolvedValueOnce( '0.8.3' )
        .mockResolvedValueOnce( '0.8.5' );
      vi.mocked( isOutdated )
        .mockReturnValueOnce( true )
        .mockReturnValueOnce( true )
        .mockReturnValueOnce( true );

      const cmd = createTestCommand( { cli: true } );
      await cmd.run();

      expect( cmd.warn ).toHaveBeenCalledWith(
        expect.stringContaining( 'package.json constrains' )
      );
    } );
  } );
} );
