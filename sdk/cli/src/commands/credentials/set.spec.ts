/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { confirm } from '@inquirer/prompts';
import * as credentialsService from '#services/credentials_service.js';
import CredentialsSet from './set.js';

vi.mock( '#services/credentials_service.js' );
vi.mock( '@inquirer/prompts', () => ( {
  confirm: vi.fn()
} ) );
vi.mock( 'js-yaml', () => ( {
  load: vi.fn( ( yaml: string ) => {
    if ( yaml.includes( '__PRIMITIVE_AT_X_Y__' ) ) {
      return { x: { y: 'FOO' } };
    }
    if ( yaml.includes( '__OBJECT_AT_X_Y__' ) ) {
      return { x: { y: { z: 'FOO' } } };
    }
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
    vi.mocked( confirm ).mockResolvedValue( true );
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
    cmd.warn = vi.fn() as any;
    cmd.error = vi.fn( ( msg: string ) => {
      throw new Error( msg );
    } ) as any;
    Object.defineProperty( cmd, 'parse', {
      value: vi.fn().mockResolvedValue( {
        args: { path: 'anthropic.api_key', value: 'sk-new-key', ...parsedArgs },
        flags: { environment: undefined, workflow: undefined, yes: false, ...flags }
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

    it( 'should have environment, workflow, and yes flags', () => {
      expect( CredentialsSet.flags.environment ).toBeDefined();
      expect( CredentialsSet.flags.workflow ).toBeDefined();
      expect( CredentialsSet.flags.yes ).toBeDefined();
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
      expect( confirm ).not.toHaveBeenCalled();
      expect( cmd.log ).toHaveBeenCalledWith( 'Set anthropic.api_key' );
    } );

    it( 'should create nested keys that do not exist', async () => {
      vi.mocked( credentialsService.decryptCredentials ).mockReturnValue( '' );
      const cmd = createTestCommand( { path: 'new.nested.key', value: 'my-value' } );
      await cmd.run();

      expect( credentialsService.writeEncrypted ).toHaveBeenCalledTimes( 1 );
      expect( confirm ).not.toHaveBeenCalled();
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

    it( 'should surface a friendly error when decryption fails', async () => {
      vi.mocked( credentialsService.decryptCredentials ).mockImplementation( () => {
        throw new Error( 'Invalid key' );
      } );
      const cmd = createTestCommand();

      await expect( cmd.run() ).rejects.toThrow( 'Failed to update credentials: Invalid key' );
    } );

    it( 'should surface a friendly error when encryption fails', async () => {
      vi.mocked( credentialsService.writeEncrypted ).mockImplementation( () => {
        throw new Error( 'Permission denied' );
      } );
      const cmd = createTestCommand();

      await expect( cmd.run() ).rejects.toThrow( 'Failed to update credentials: Permission denied' );
    } );
  } );

  describe( 'shape-change confirmation', () => {
    it( 'should prompt before converting a primitive value into an object', async () => {
      vi.mocked( credentialsService.decryptCredentials ).mockReturnValue( '__PRIMITIVE_AT_X_Y__' );
      const cmd = createTestCommand( { path: 'x.y.z', value: 'BAR' } );

      await cmd.run();

      expect( cmd.warn ).toHaveBeenCalledWith( expect.stringContaining( 'convert "x.y" from a value into an object' ) );
      expect( confirm ).toHaveBeenCalledTimes( 1 );
      expect( credentialsService.writeEncrypted ).toHaveBeenCalledTimes( 1 );
      expect( cmd.log ).toHaveBeenCalledWith( 'Set x.y.z' );
    } );

    it( 'should prompt before replacing an object with a primitive value', async () => {
      vi.mocked( credentialsService.decryptCredentials ).mockReturnValue( '__OBJECT_AT_X_Y__' );
      const cmd = createTestCommand( { path: 'x.y', value: 'BAR' } );

      await cmd.run();

      expect( cmd.warn ).toHaveBeenCalledWith( expect.stringContaining( 'replace the existing object' ) );
      expect( confirm ).toHaveBeenCalledTimes( 1 );
      expect( credentialsService.writeEncrypted ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'should abort without writing when the user declines the prompt', async () => {
      vi.mocked( credentialsService.decryptCredentials ).mockReturnValue( '__PRIMITIVE_AT_X_Y__' );
      vi.mocked( confirm ).mockResolvedValue( false );
      const cmd = createTestCommand( { path: 'x.y.z', value: 'BAR' } );

      await cmd.run();

      expect( credentialsService.writeEncrypted ).not.toHaveBeenCalled();
      expect( cmd.log ).toHaveBeenCalledWith( 'Aborted.' );
      expect( cmd.log ).not.toHaveBeenCalledWith( 'Set x.y.z' );
    } );

    it( 'should skip the prompt when --yes is passed', async () => {
      vi.mocked( credentialsService.decryptCredentials ).mockReturnValue( '__PRIMITIVE_AT_X_Y__' );
      const cmd = createTestCommand( { path: 'x.y.z', value: 'BAR' }, { yes: true } );

      await cmd.run();

      expect( confirm ).not.toHaveBeenCalled();
      expect( credentialsService.writeEncrypted ).toHaveBeenCalledTimes( 1 );
      expect( cmd.log ).toHaveBeenCalledWith( 'Set x.y.z' );
    } );
  } );
} );
