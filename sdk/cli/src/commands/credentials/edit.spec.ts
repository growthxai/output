/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as credentialsService from '#services/credentials_service.js';
import CredentialsEdit from './edit.js';

vi.mock( '#services/credentials_service.js' );
vi.mock( 'js-yaml', () => ( {
  load: vi.fn()
} ) );

vi.mock( 'node:fs', () => ( {
  default: {
    writeFileSync: vi.fn(),
    readFileSync: vi.fn( () => 'edited: content\n' ),
    existsSync: vi.fn( () => true ),
    statSync: vi.fn( () => ( { size: 16 } ) ),
    unlinkSync: vi.fn()
  }
} ) );

vi.mock( 'node:child_process', () => ( {
  spawnSync: vi.fn( () => ( { status: 0 } ) )
} ) );

describe( 'credentials edit command', () => {
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
    const cmd = new CredentialsEdit( [], {} as any );
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
      expect( CredentialsEdit.description ).toContain( 'Edit' );
    } );

    it( 'should have environment and workflow flags', () => {
      expect( CredentialsEdit.flags.environment ).toBeDefined();
      expect( CredentialsEdit.flags.workflow ).toBeDefined();
    } );
  } );

  describe( 'command execution', () => {
    it( 'should decrypt, spawn editor, and re-encrypt', async () => {
      const cmd = createTestCommand();
      await cmd.run();

      expect( credentialsService.decryptCredentials ).toHaveBeenCalledWith( undefined, undefined );
      expect( credentialsService.writeEncrypted ).toHaveBeenCalled();
      expect( cmd.log ).toHaveBeenCalledWith( 'Credentials saved successfully.' );
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
