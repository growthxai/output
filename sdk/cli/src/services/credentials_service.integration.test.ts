import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { load as parseYaml } from 'js-yaml';
import { encrypt, decrypt, generateKey } from '@outputai/credentials';

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
} );
