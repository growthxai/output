import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';

vi.mock( 'node:fs', () => ( {
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn()
  }
} ) );

vi.mock( '@outputai/credentials', async importOriginal => ( {
  ...( await importOriginal<Record<string, unknown>>() ),
  encrypt: vi.fn( ( plaintext: string ) => `encrypted:${plaintext}` ),
  decrypt: vi.fn( ( ciphertext: string ) => ciphertext.replace( 'encrypted:', '' ) ),
  generateKey: vi.fn( () => 'a'.repeat( 64 ) )
} ) );

import {
  resolveCredentialsPath,
  resolveKeyPath,
  credentialsExist,
  resolveKey,
  decryptCredentials,
  initCredentials
} from './credentials_service.js';

import fs from 'node:fs';

describe( 'credentials service', () => {
  const cwd = process.cwd();

  beforeEach( () => {
    vi.clearAllMocks();
    delete process.env.OUTPUT_CREDENTIALS_KEY;
    delete process.env.OUTPUT_CREDENTIALS_KEY_PRODUCTION;
  } );

  afterEach( () => {
    delete process.env.OUTPUT_CREDENTIALS_KEY;
    delete process.env.OUTPUT_CREDENTIALS_KEY_PRODUCTION;
  } );

  describe( 'resolveCredentialsPath', () => {
    it( 'should resolve default path when no environment', () => {
      const result = resolveCredentialsPath( undefined );
      expect( result ).toBe( path.resolve( cwd, 'config', 'credentials.yml.enc' ) );
    } );

    it( 'should resolve environment-specific path', () => {
      const result = resolveCredentialsPath( 'production' );
      expect( result ).toBe( path.resolve( cwd, 'config', 'credentials', 'production.yml.enc' ) );
    } );
  } );

  describe( 'resolveKeyPath', () => {
    it( 'should resolve default key path', () => {
      const result = resolveKeyPath( undefined );
      expect( result ).toBe( path.resolve( cwd, 'config', 'credentials.key' ) );
    } );

    it( 'should resolve environment-specific key path', () => {
      const result = resolveKeyPath( 'staging' );
      expect( result ).toBe( path.resolve( cwd, 'config', 'credentials', 'staging.key' ) );
    } );
  } );

  describe( 'credentialsExist', () => {
    it( 'should return true when credentials file exists', () => {
      vi.mocked( fs.existsSync ).mockReturnValue( true );
      expect( credentialsExist( undefined ) ).toBe( true );
    } );

    it( 'should return false when credentials file does not exist', () => {
      vi.mocked( fs.existsSync ).mockReturnValue( false );
      expect( credentialsExist( undefined ) ).toBe( false );
    } );
  } );

  describe( 'resolveKey', () => {
    it( 'should return key from env var', () => {
      process.env.OUTPUT_CREDENTIALS_KEY = 'env-key';
      expect( resolveKey( undefined ) ).toBe( 'env-key' );
    } );

    it( 'should return environment-specific key from env var', () => {
      process.env.OUTPUT_CREDENTIALS_KEY_PRODUCTION = 'prod-key';
      expect( resolveKey( 'production' ) ).toBe( 'prod-key' );
    } );

    it( 'should fall back to key file', () => {
      vi.mocked( fs.existsSync ).mockReturnValue( true );
      vi.mocked( fs.readFileSync ).mockReturnValue( 'file-key\n' );

      expect( resolveKey( undefined ) ).toBe( 'file-key' );
    } );

    it( 'should throw when no key source is available', () => {
      vi.mocked( fs.existsSync ).mockReturnValue( false );
      expect( () => resolveKey( undefined ) ).toThrow( 'No key found' );
    } );
  } );

  describe( 'decryptCredentials', () => {
    it( 'should decrypt credentials file', () => {
      process.env.OUTPUT_CREDENTIALS_KEY = 'test-key';
      vi.mocked( fs.existsSync ).mockReturnValue( true );
      vi.mocked( fs.readFileSync ).mockReturnValue( 'encrypted:hello' );

      expect( decryptCredentials( undefined ) ).toBe( 'hello' );
    } );

    it( 'should throw when credentials file does not exist', () => {
      process.env.OUTPUT_CREDENTIALS_KEY = 'test-key';
      vi.mocked( fs.existsSync ).mockReturnValue( false );

      expect( () => decryptCredentials( undefined ) ).toThrow( 'Credentials file not found' );
    } );
  } );

  describe( 'initCredentials', () => {
    it( 'should create key file and encrypted credentials file', () => {
      const result = initCredentials( undefined );

      expect( fs.mkdirSync ).toHaveBeenCalled();
      expect( fs.writeFileSync ).toHaveBeenCalledTimes( 2 );
      expect( result.keyPath ).toContain( 'credentials.key' );
      expect( result.credPath ).toContain( 'credentials.yml.enc' );
    } );

    it( 'should create environment-specific files', () => {
      const result = initCredentials( 'production' );

      expect( result.keyPath ).toContain( path.join( 'credentials', 'production.key' ) );
      expect( result.credPath ).toContain( path.join( 'credentials', 'production.yml.enc' ) );
    } );
  } );
} );
