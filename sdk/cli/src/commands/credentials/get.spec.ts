/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as credentialsService from '#services/credentials_service.js';
import CredentialsGet from './get.js';

vi.mock( '#services/credentials_service.js' );
vi.mock( 'js-yaml', () => ( {
  load: vi.fn( ( yaml: string ) => ( { anthropic: { api_key: yaml.includes( 'sk-test' ) ? 'sk-test' : undefined } } ) )
} ) );
vi.mock( '@outputai/credentials', () => ( {
  getNestedValue: vi.fn( ( obj: any, path: string ) => {
    const parts = path.split( '.' );
    return parts.reduce( ( acc: any, part: string ) => acc?.[part], obj );
  } )
} ) );

describe( 'credentials get command', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    vi.mocked( credentialsService.credentialsExist ).mockReturnValue( true );
    vi.mocked( credentialsService.decryptCredentials ).mockReturnValue( 'anthropic:\n  api_key: sk-test\n' );
  } );

  afterEach( () => {
    vi.restoreAllMocks();
  } );

  const createTestCommand = (
    parsedArgs: Record<string, unknown> = {},
    flags: Record<string, unknown> = {}
  ) => {
    const cmd = new CredentialsGet( [], {} as any );
    cmd.log = vi.fn();
    cmd.error = vi.fn( ( msg: string ) => {
      throw new Error( msg );
    } ) as any;
    Object.defineProperty( cmd, 'parse', {
      value: vi.fn().mockResolvedValue( {
        args: { path: 'anthropic.api_key', ...parsedArgs },
        flags: { environment: undefined, workflow: undefined, ...flags }
      } ),
      configurable: true
    } );
    return cmd;
  };

  describe( 'command structure', () => {
    it( 'should have correct description', () => {
      expect( CredentialsGet.description ).toContain( 'credential value' );
    } );

    it( 'should have a required path argument', () => {
      expect( CredentialsGet.args.path ).toBeDefined();
      expect( CredentialsGet.args.path.required ).toBe( true );
    } );

    it( 'should have environment and workflow flags', () => {
      expect( CredentialsGet.flags.environment ).toBeDefined();
      expect( CredentialsGet.flags.workflow ).toBeDefined();
    } );
  } );

  describe( 'command execution', () => {
    it( 'should log the credential value', async () => {
      const cmd = createTestCommand();
      await cmd.run();

      expect( credentialsService.decryptCredentials ).toHaveBeenCalledWith( undefined, undefined );
      expect( cmd.log ).toHaveBeenCalledWith( 'sk-test' );
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

    it( 'should error when credential path is not found', async () => {
      const cmd = createTestCommand( { path: 'nonexistent.key' } );

      await expect( cmd.run() ).rejects.toThrow( 'Credential not found' );
    } );
  } );
} );
