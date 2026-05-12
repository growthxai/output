/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
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

  // Regression: OUT-441 — editing without making changes must not re-encrypt
  // the file. AES-GCM uses a fresh nonce per encrypt, so an unconditional
  // re-write produces a new ciphertext and leaves the file dirty in git.
  describe( 'no-op edit (OUT-441)', () => {
    it( 'should NOT call writeEncrypted when the editor returns unchanged plaintext', async () => {
      const original = 'anthropic:\n  api_key: sk-test\n';
      vi.mocked( credentialsService.decryptCredentials ).mockReturnValue( original );
      vi.mocked( fs.readFileSync ).mockReturnValue( original );

      const cmd = createTestCommand();
      await cmd.run();

      expect( credentialsService.writeEncrypted ).not.toHaveBeenCalled();
    } );

    it( 'should still call writeEncrypted when the editor returns modified plaintext', async () => {
      const original = 'anthropic:\n  api_key: sk-test\n';
      const modified = 'anthropic:\n  api_key: sk-NEW\n';
      vi.mocked( credentialsService.decryptCredentials ).mockReturnValue( original );
      vi.mocked( fs.readFileSync ).mockReturnValue( modified );

      const cmd = createTestCommand();
      await cmd.run();

      expect( credentialsService.writeEncrypted ).toHaveBeenCalledWith( undefined, modified, undefined );
    } );
  } );
} );
