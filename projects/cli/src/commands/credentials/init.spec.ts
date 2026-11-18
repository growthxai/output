/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as credentialsService from '#services/credentials_service.js';
import CredentialsInit from './init.js';

vi.mock( '#services/credentials_service.js' );

describe( 'credentials init command', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    vi.mocked( credentialsService.credentialsExist ).mockReturnValue( false );
    vi.mocked( credentialsService.initCredentials ).mockReturnValue( {
      keyPath: '/project/config/credentials.key',
      credPath: '/project/config/credentials.yml.enc'
    } );
    vi.mocked( credentialsService.resolveKeyPath ).mockReturnValue( '/project/config/credentials.key' );
  } );

  afterEach( () => {
    vi.restoreAllMocks();
  } );

  const createTestCommand = (
    flags: Record<string, unknown> = {}
  ) => {
    const cmd = new CredentialsInit( [], {} as any );
    cmd.log = vi.fn();
    cmd.error = vi.fn( ( msg: string ) => {
      throw new Error( msg );
    } ) as any;
    Object.defineProperty( cmd, 'parse', {
      value: vi.fn().mockResolvedValue( {
        args: {},
        flags: { environment: undefined, workflow: undefined, force: false, ...flags }
      } ),
      configurable: true
    } );
    return cmd;
  };

  describe( 'command structure', () => {
    it( 'should have correct description', () => {
      expect( CredentialsInit.description ).toContain( 'Initialize' );
    } );

    it( 'should have environment, workflow, and force flags', () => {
      expect( CredentialsInit.flags.environment ).toBeDefined();
      expect( CredentialsInit.flags.workflow ).toBeDefined();
      expect( CredentialsInit.flags.force ).toBeDefined();
    } );
  } );

  describe( 'command execution', () => {
    it( 'should call initCredentials and log results', async () => {
      const cmd = createTestCommand();
      await cmd.run();

      expect( credentialsService.initCredentials ).toHaveBeenCalledWith( undefined, undefined );
      expect( cmd.log ).toHaveBeenCalledWith( expect.stringContaining( 'credentials.key' ) );
    } );

    it( 'should error when both environment and workflow are specified', async () => {
      const cmd = createTestCommand( { environment: 'production', workflow: 'my_workflow' } );

      await expect( cmd.run() ).rejects.toThrow( 'Cannot specify both' );
    } );

    it( 'should error when credentials already exist without --force', async () => {
      vi.mocked( credentialsService.credentialsExist ).mockReturnValue( true );
      vi.mocked( credentialsService.resolveCredentialsPath ).mockReturnValue( '/project/config/credentials.yml.enc' );
      const cmd = createTestCommand();

      await expect( cmd.run() ).rejects.toThrow( 'already exist' );
    } );

    it( 'should proceed when credentials exist with --force', async () => {
      vi.mocked( credentialsService.credentialsExist ).mockReturnValue( true );
      const cmd = createTestCommand( { force: true } );
      await cmd.run();

      expect( credentialsService.initCredentials ).toHaveBeenCalled();
    } );
  } );
} );
