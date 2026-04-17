/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as credentialsService from '#services/credentials_service.js';
import CredentialsSet from './set.js';

vi.mock( '#services/credentials_service.js' );
vi.mock( 'js-yaml', () => ( {
  load: vi.fn( ( yaml: string ) => {
    if ( yaml.includes( 'sk-existing' ) ) {
      return { anthropic: { api_key: 'sk-existing' } };
    }
    return {};
  } ),
  dump: vi.fn( ( obj: any ) => JSON.stringify( obj ) )
} ) );

describe( 'credentials set command', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    vi.mocked( credentialsService.credentialsExist ).mockReturnValue( true );
    vi.mocked( credentialsService.decryptCredentials ).mockReturnValue( 'anthropic:\n  api_key: sk-existing\n' );
    vi.mocked( credentialsService.writeEncrypted ).mockImplementation( () => {} );
  } );

  afterEach( () => {
    vi.restoreAllMocks();
  } );

  const createTestCommand = (
    parsedArgs: Record<string, unknown> = {},
    flags: Record<string, unknown> = {}
  ) => {
    const cmd = new CredentialsSet( [], {} as any );
    cmd.log = vi.fn();
    cmd.error = vi.fn( ( msg: string ) => {
      throw new Error( msg );
    } ) as any;
    Object.defineProperty( cmd, 'parse', {
      value: vi.fn().mockResolvedValue( {
        args: { path: 'anthropic.api_key', value: 'sk-new-key', ...parsedArgs },
        flags: { environment: undefined, workflow: undefined, ...flags }
      } ),
      configurable: true
    } );
    return cmd;
  };

  describe( 'command structure', () => {
    it( 'should have correct description', () => {
      expect( CredentialsSet.description ).toContain( 'credential value' );
    } );

    it( 'should have required path and value arguments', () => {
      expect( CredentialsSet.args.path ).toBeDefined();
      expect( CredentialsSet.args.path.required ).toBe( true );
      expect( CredentialsSet.args.value ).toBeDefined();
      expect( CredentialsSet.args.value.required ).toBe( true );
    } );

    it( 'should have environment and workflow flags', () => {
      expect( CredentialsSet.flags.environment ).toBeDefined();
      expect( CredentialsSet.flags.workflow ).toBeDefined();
    } );
  } );

  describe( 'command execution', () => {
    it( 'should decrypt, update, and re-encrypt credentials', async () => {
      const cmd = createTestCommand();
      await cmd.run();

      expect( credentialsService.decryptCredentials ).toHaveBeenCalledWith( undefined, undefined );
      expect( credentialsService.writeEncrypted ).toHaveBeenCalledWith(
        undefined,
        expect.any( String ),
        undefined
      );
      expect( cmd.log ).toHaveBeenCalledWith( 'Set anthropic.api_key' );
    } );

    it( 'should create nested keys that do not exist', async () => {
      vi.mocked( credentialsService.decryptCredentials ).mockReturnValue( '' );
      const cmd = createTestCommand( { path: 'new.nested.key', value: 'my-value' } );
      await cmd.run();

      expect( credentialsService.writeEncrypted ).toHaveBeenCalledTimes( 1 );
      expect( cmd.log ).toHaveBeenCalledWith( 'Set new.nested.key' );
    } );

    it( 'should pass environment flag to service functions', async () => {
      const cmd = createTestCommand( {}, { environment: 'production' } );
      await cmd.run();

      expect( credentialsService.credentialsExist ).toHaveBeenCalledWith( 'production', undefined );
      expect( credentialsService.decryptCredentials ).toHaveBeenCalledWith( 'production', undefined );
      expect( credentialsService.writeEncrypted ).toHaveBeenCalledWith( 'production', expect.any( String ), undefined );
    } );

    it( 'should pass workflow flag to service functions', async () => {
      const cmd = createTestCommand( {}, { workflow: 'my_workflow' } );
      await cmd.run();

      expect( credentialsService.credentialsExist ).toHaveBeenCalledWith( undefined, 'my_workflow' );
      expect( credentialsService.decryptCredentials ).toHaveBeenCalledWith( undefined, 'my_workflow' );
      expect( credentialsService.writeEncrypted ).toHaveBeenCalledWith( undefined, expect.any( String ), 'my_workflow' );
    } );

    it( 'should error when both environment and workflow are specified', async () => {
      const cmd = createTestCommand( {}, { environment: 'production', workflow: 'my_workflow' } );

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
