/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as credentialsService from '#services/credentials_service.js';
import CredentialsShow from './show.js';

vi.mock( '#services/credentials_service.js' );

describe( 'credentials show command', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    vi.mocked( credentialsService.credentialsExist ).mockReturnValue( true );
    vi.mocked( credentialsService.decryptCredentials ).mockReturnValue( 'anthropic:\n  api_key: sk-test\n' );
  } );

  afterEach( () => {
    vi.restoreAllMocks();
  } );

  const createTestCommand = (
    flags: Record<string, unknown> = {}
  ) => {
    const cmd = new CredentialsShow( [], {} as any );
    cmd.log = vi.fn();
    cmd.error = vi.fn( ( msg: string ) => {
      throw new Error( msg );
    } ) as any;
    Object.defineProperty( cmd, 'parse', {
      value: vi.fn().mockResolvedValue( {
        args: {},
        flags: { environment: undefined, workflow: undefined, ...flags }
      } ),
      configurable: true
    } );
    return cmd;
  };

  describe( 'command structure', () => {
    it( 'should have correct description', () => {
      expect( CredentialsShow.description ).toContain( 'Show' );
    } );

    it( 'should have environment and workflow flags', () => {
      expect( CredentialsShow.flags.environment ).toBeDefined();
      expect( CredentialsShow.flags.workflow ).toBeDefined();
    } );
  } );

  describe( 'command execution', () => {
    it( 'should log decrypted credentials', async () => {
      const cmd = createTestCommand();
      await cmd.run();

      expect( credentialsService.decryptCredentials ).toHaveBeenCalledWith( undefined, undefined );
      expect( cmd.log ).toHaveBeenCalledWith( 'anthropic:\n  api_key: sk-test\n' );
    } );

    it( 'should error when both environment and workflow are specified', async () => {
      const cmd = createTestCommand( { environment: 'production', workflow: 'my_workflow' } );

      await expect( cmd.run() ).rejects.toThrow( 'Cannot specify both' );
    } );

    it( 'should error when credentials file does not exist', async () => {
      vi.mocked( credentialsService.credentialsExist ).mockReturnValue( false );
      vi.mocked( credentialsService.resolveCredentialsPath ).mockReturnValue( '/project/config/credentials.yml.enc' );
      const cmd = createTestCommand();

      await expect( cmd.run() ).rejects.toThrow( 'No credentials file found' );
    } );
  } );
} );
