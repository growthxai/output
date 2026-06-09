import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { load as parseYaml } from 'js-yaml';
import { encrypt, decrypt, generateKey } from '@outputai/credentials';
import {
  initCredentials,
  decryptCredentials,
  writeEncrypted,
  checkKeyMatchesCredentials
} from './credentials_service.js';

describe( 'credentials service integration', () => {
  const tmpDir = fs.mkdtempSync( path.join( os.tmpdir(), 'output-creds-' ) );

  afterAll( () => {
    fs.rmSync( tmpDir, { recursive: true, force: true } );
  } );

  describe( 'encryption round-trip', () => {
    it( 'should generate a valid hex key', () => {
      const key = generateKey();

      expect( key ).toMatch( /^[0-9a-f]{64}$/ );
    } );

    it( 'should encrypt and decrypt plaintext', () => {
      const key = generateKey();
      const plaintext = 'anthropic:\n  api_key: sk-test-123\n';

      const ciphertext = encrypt( plaintext, key );
      const decrypted = decrypt( ciphertext, key );

      expect( decrypted ).toBe( plaintext );
    } );

    it( 'should produce different ciphertext for the same plaintext (nonce)', () => {
      const key = generateKey();
      const plaintext = 'test: value\n';

      const a = encrypt( plaintext, key );
      const b = encrypt( plaintext, key );

      expect( a ).not.toBe( b );
      expect( decrypt( a, key ) ).toBe( plaintext );
      expect( decrypt( b, key ) ).toBe( plaintext );
    } );
  } );

  describe( 'init, decrypt, and re-encrypt workflow', () => {
    const key = generateKey();
    const configDir = path.join( tmpDir, 'config' );
    const keyPath = path.join( configDir, 'credentials.key' );
    const credPath = path.join( configDir, 'credentials.yml.enc' );
    const template = 'anthropic:\n  api_key: ""\nopenai:\n  api_key: ""\n';

    // Set up files once for all tests in this block
    fs.mkdirSync( configDir, { recursive: true } );
    fs.writeFileSync( keyPath, key, { mode: 0o600 } );
    fs.writeFileSync( credPath, encrypt( template, key ), 'utf8' );

    it( 'should create key and encrypted credentials on disk', () => {
      expect( fs.existsSync( keyPath ) ).toBe( true );
      expect( fs.existsSync( credPath ) ).toBe( true );
    } );

    it( 'should decrypt to valid YAML', () => {
      const ciphertext = fs.readFileSync( credPath, 'utf8' ).trim();
      const plaintext = decrypt( ciphertext, key );
      const parsed = parseYaml( plaintext ) as Record<string, unknown>;

      expect( parsed ).toHaveProperty( 'anthropic' );
      expect( parsed ).toHaveProperty( 'openai' );
    } );

    it( 'should re-encrypt updated credentials and round-trip', () => {
      const updated = 'anthropic:\n  api_key: sk-new-key-456\nopenai:\n  api_key: sk-openai-789\n';

      fs.writeFileSync( credPath, encrypt( updated, key ), 'utf8' );

      const ciphertext = fs.readFileSync( credPath, 'utf8' ).trim();
      const decrypted = decrypt( ciphertext, key );

      expect( decrypted ).toBe( updated );

      const parsed = parseYaml( decrypted ) as Record<string, Record<string, string>>;
      expect( parsed.anthropic.api_key ).toBe( 'sk-new-key-456' );
      expect( parsed.openai.api_key ).toBe( 'sk-openai-789' );
    } );
  } );

  // Reproduction: editing the dev credential must not touch the production
  // credential. Reported as a partial bug report — these tests pin the
  // cross-environment isolation invariant.
  describe( 'multi-environment isolation', () => {
    const withIsolatedProject = ( body: () => void ): void => {
      const originalCwd = process.cwd();
      const projectDir = fs.mkdtempSync( path.join( os.tmpdir(), 'output-creds-multi-env-' ) );
      process.chdir( projectDir );
      try {
        body();
      } finally {
        process.chdir( originalCwd );
        fs.rmSync( projectDir, { recursive: true, force: true } );
      }
    };

    it( 'editing the development credential does not modify the production credential', () => withIsolatedProject( () => {
      const prod = initCredentials( 'production' );
      const dev = initCredentials( 'development' );

      const prodKeyBefore = fs.readFileSync( prod.keyPath );
      const prodCredBefore = fs.readFileSync( prod.credPath );
      const devKeyBefore = fs.readFileSync( dev.keyPath );

      writeEncrypted(
        'development',
        'anthropic:\n  api_key: sk-DEV-EDITED\nopenai:\n  api_key: sk-DEV-EDITED-2\n'
      );

      // Production must be byte-for-byte identical
      expect( fs.readFileSync( prod.keyPath ).equals( prodKeyBefore ) ).toBe( true );
      expect( fs.readFileSync( prod.credPath ).equals( prodCredBefore ) ).toBe( true );

      // Dev key must not have been regenerated
      expect( fs.readFileSync( dev.keyPath ).equals( devKeyBefore ) ).toBe( true );

      // Dev credential should now contain the edited plaintext
      expect( decryptCredentials( 'development' ) ).toContain( 'sk-DEV-EDITED' );

      // Production credential should still be the original template (empty values)
      const prodPlain = decryptCredentials( 'production' );
      const prodParsed = parseYaml( prodPlain ) as Record<string, Record<string, string>>;
      expect( prodParsed.anthropic.api_key ).toBe( '' );
      expect( prodParsed.openai.api_key ).toBe( '' );
    } ) );

    it( 'editing production does not bleed into development', () => withIsolatedProject( () => {
      const prod = initCredentials( 'production' );
      const dev = initCredentials( 'development' );

      const devKeyBefore = fs.readFileSync( dev.keyPath );
      const devCredBefore = fs.readFileSync( dev.credPath );

      writeEncrypted(
        'production',
        'anthropic:\n  api_key: sk-PROD-EDITED\nopenai:\n  api_key: sk-PROD-EDITED-2\n'
      );

      expect( fs.readFileSync( dev.keyPath ).equals( devKeyBefore ) ).toBe( true );
      expect( fs.readFileSync( dev.credPath ).equals( devCredBefore ) ).toBe( true );

      expect( decryptCredentials( 'production' ) ).toContain( 'sk-PROD-EDITED' );
      expect( decryptCredentials( 'development' ) ).not.toContain( 'sk-PROD-EDITED' );

      // Sanity: prod and dev still resolved to different paths/keys
      expect( prod.keyPath ).not.toBe( dev.keyPath );
      expect( prod.credPath ).not.toBe( dev.credPath );
    } ) );

    it( 'initializing a second environment does not mutate the first', () => withIsolatedProject( () => {
      const prod = initCredentials( 'production' );
      const prodKeyBytes = fs.readFileSync( prod.keyPath );
      const prodCredBytes = fs.readFileSync( prod.credPath );

      initCredentials( 'development' );

      expect( fs.readFileSync( prod.keyPath ).equals( prodKeyBytes ) ).toBe( true );
      expect( fs.readFileSync( prod.credPath ).equals( prodCredBytes ) ).toBe( true );
    } ) );
  } );

  describe( 'checkKeyMatchesCredentials', () => {
    const withIsolatedProject = ( body: () => void ): void => {
      const originalCwd = process.cwd();
      const originalKey = process.env.OUTPUT_CREDENTIALS_KEY;
      delete process.env.OUTPUT_CREDENTIALS_KEY;
      const projectDir = fs.mkdtempSync( path.join( os.tmpdir(), 'output-creds-keymatch-' ) );
      process.chdir( projectDir );
      try {
        body();
      } finally {
        process.chdir( originalCwd );
        if ( originalKey === undefined ) {
          delete process.env.OUTPUT_CREDENTIALS_KEY;
        } else {
          process.env.OUTPUT_CREDENTIALS_KEY = originalKey;
        }
        fs.rmSync( projectDir, { recursive: true, force: true } );
      }
    };

    it( 'returns "no_file" when no credentials file exists', () => withIsolatedProject( () => {
      expect( checkKeyMatchesCredentials( undefined ) ).toBe( 'no_file' );
    } ) );

    it( 'returns "match" when the current key decrypts the file', () => withIsolatedProject( () => {
      initCredentials( undefined );

      expect( checkKeyMatchesCredentials( undefined ) ).toBe( 'match' );
    } ) );

    it( 'returns "mismatch" when the key cannot decrypt the file', () => withIsolatedProject( () => {
      const { keyPath } = initCredentials( undefined );
      fs.writeFileSync( keyPath, generateKey(), { mode: 0o600 } );

      expect( checkKeyMatchesCredentials( undefined ) ).toBe( 'mismatch' );
    } ) );
  } );
} );
