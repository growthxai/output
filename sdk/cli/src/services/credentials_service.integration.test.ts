import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { load as parseYaml } from 'js-yaml';
import { encrypt, decrypt, generateKey, generateKeypair, seal, SealedRecipientMismatchError } from '@outputai/credentials';
import {
  initCredentials,
  initSealed,
  migrateToSealed,
  decryptCredentials,
  writeEncrypted,
  writeSealedDocument,
  readSealedDocument,
  resolveRecipientPublicKey,
  isSealedCredentials
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

  describe( 'sealed (asymmetric) credentials', () => {
    const withIsolatedProject = ( body: () => void ): void => {
      const originalCwd = process.cwd();
      const projectDir = fs.mkdtempSync( path.join( os.tmpdir(), 'output-creds-sealed-' ) );
      process.chdir( projectDir );
      try {
        body();
      } finally {
        process.chdir( originalCwd );
        fs.rmSync( projectDir, { recursive: true, force: true } );
      }
    };

    it( 'initSealed creates a private key, a committed public key, and a sealed file', () => withIsolatedProject( () => {
      const { keyPath, pubPath, credPath, publicKey } = initSealed( 'production' );

      expect( fs.existsSync( keyPath ) ).toBe( true );
      expect( fs.readFileSync( pubPath, 'utf8' ).trim() ).toBe( publicKey );
      expect( fs.readFileSync( credPath, 'utf8' ) ).toContain( '__format__: sealed-v1' );
      expect( isSealedCredentials( 'production' ) ).toBe( true );
    } ) );

    it( 'a value can be added without the private key, then read back with it', () => withIsolatedProject( () => {
      const { keyPath } = initSealed( 'production' );
      const privateKey = fs.readFileSync( keyPath, 'utf8' ).trim();

      // Seal a value using only the committed public key, with the private key absent.
      const recipient = resolveRecipientPublicKey( 'production' );
      fs.rmSync( keyPath );

      const { data } = readSealedDocument( 'production' );
      ( data.anthropic as Record<string, unknown> ).api_key = seal( 'sk-ant-REAL', recipient );
      writeSealedDocument( 'production', recipient, data );

      // Restore the private key; the value added without it now decrypts.
      fs.writeFileSync( keyPath, privateKey, { mode: 0o600 } );
      expect( decryptCredentials( 'production' ) ).toContain( 'sk-ant-REAL' );
    } ) );

    it( 'decryptCredentials opens sealed values and rejects the wrong private key', () => withIsolatedProject( () => {
      const { keyPath, publicKey } = initSealed( 'production' );
      const recipient = resolveRecipientPublicKey( 'production' );
      expect( recipient ).toBe( publicKey );

      const { data } = readSealedDocument( 'production' );
      ( data.anthropic as Record<string, unknown> ).api_key = seal( 'sk-ant-REAL', recipient );
      writeSealedDocument( 'production', recipient, data );

      // Correct key (written by initSealed) opens the value.
      expect( decryptCredentials( 'production' ) ).toContain( 'sk-ant-REAL' );

      // A different private key is rejected with a precise error.
      fs.writeFileSync( keyPath, generateKeypair().privateKey, { mode: 0o600 } );
      expect( () => decryptCredentials( 'production' ) ).toThrow( SealedRecipientMismatchError );
    } ) );

    it( 'migrateToSealed converts a legacy file and the old symmetric key stops working', () => withIsolatedProject( () => {
      const legacyKey = generateKey();
      fs.mkdirSync( 'config/credentials', { recursive: true } );
      fs.writeFileSync( 'config/credentials/production.key', legacyKey, { mode: 0o600 } );
      fs.writeFileSync(
        'config/credentials/production.yml.enc',
        encrypt( 'anthropic:\n  api_key: sk-legacy\n', legacyKey ),
        'utf8'
      );

      const { privateKey, publicKey, pubPath } = migrateToSealed( 'production' );

      expect( isSealedCredentials( 'production' ) ).toBe( true );
      expect( fs.readFileSync( pubPath, 'utf8' ).trim() ).toBe( publicKey );
      // The new private key (written to the key file) opens the migrated value.
      expect( decryptCredentials( 'production' ) ).toContain( 'sk-legacy' );
      expect( fs.readFileSync( 'config/credentials/production.key', 'utf8' ).trim() ).toBe( privateKey );

      // The old symmetric key can no longer decrypt the now-sealed file.
      expect( () => decrypt( fs.readFileSync( 'config/credentials/production.yml.enc', 'utf8' ).trim(), legacyKey ) )
        .toThrow();
    } ) );

    it( 'migrateToSealed tightens the private key file to 0600 even over a broad-perm legacy key', () => withIsolatedProject( () => {
      const legacyKey = generateKey();
      fs.mkdirSync( 'config/credentials', { recursive: true } );
      // Legacy key created out-of-band with world-readable perms.
      fs.writeFileSync( 'config/credentials/production.key', legacyKey, { mode: 0o644 } );
      fs.chmodSync( 'config/credentials/production.key', 0o644 );
      fs.writeFileSync(
        'config/credentials/production.yml.enc',
        encrypt( 'anthropic:\n  api_key: sk-legacy\n', legacyKey ),
        'utf8'
      );

      const { keyPath } = migrateToSealed( 'production' );

      // Low 3 octal digits of the mode must be 600 (owner read/write only).
      expect( fs.statSync( keyPath ).mode.toString( 8 ).slice( -3 ) ).toBe( '600' );
    } ) );

    it( 'writeEncrypted preserves the sealed token of an unchanged value when editing', () => withIsolatedProject( () => {
      initSealed( 'production' );
      const recipient = resolveRecipientPublicKey( 'production' );

      const { data } = readSealedDocument( 'production' );
      ( data.anthropic as Record<string, unknown> ).api_key = seal( 'KEEP', recipient );
      ( data.openai as Record<string, unknown> ).api_key = seal( 'OLD', recipient );
      writeSealedDocument( 'production', recipient, data );

      const before = readSealedDocument( 'production' ).data;
      const keptToken = ( before.anthropic as Record<string, unknown> ).api_key;

      // Edit flow: decrypt, change only openai, re-save.
      writeEncrypted( 'production', 'anthropic:\n  api_key: KEEP\nopenai:\n  api_key: NEW\n' );

      const after = readSealedDocument( 'production' ).data;
      // Unchanged value keeps its exact ciphertext (no diff churn); changed value is re-sealed.
      expect( ( after.anthropic as Record<string, unknown> ).api_key ).toBe( keptToken );
      expect( ( after.openai as Record<string, unknown> ).api_key )
        .not.toBe( ( before.openai as Record<string, unknown> ).api_key );
      expect( decryptCredentials( 'production' ) ).toContain( 'NEW' );
    } ) );

    it( 'writeEncrypted re-seals the whole tree to the rotated recipient (never a mixed-recipient file)', () => withIsolatedProject( () => {
      initSealed( 'production' );
      const original = resolveRecipientPublicKey( 'production' );

      const { data } = readSealedDocument( 'production' );
      ( data.anthropic as Record<string, unknown> ).api_key = seal( 'A1', original );
      ( data.openai as Record<string, unknown> ).api_key = seal( 'A2', original );
      writeSealedDocument( 'production', original, data );

      // Rotate the committed public key WITHOUT re-sealing the file: the file's values
      // are still sealed to `original`, but the .pub now advertises a new recipient.
      const rotated = generateKeypair();
      fs.writeFileSync( 'config/credentials/production.pub', rotated.publicKey, 'utf8' );

      // An edit (one value changed) must seal EVERY value to the rotated recipient.
      writeEncrypted( 'production', 'anthropic:\n  api_key: A1\nopenai:\n  api_key: CHANGED\n' );

      expect( readSealedDocument( 'production' ).recipient ).toBe( rotated.publicKey );

      // The rotated private key opens the entire file — no value was left sealed to `original`.
      fs.writeFileSync( 'config/credentials/production.key', rotated.privateKey, { mode: 0o600 } );
      const plain = decryptCredentials( 'production' );
      expect( plain ).toContain( 'A1' );
      expect( plain ).toContain( 'CHANGED' );
    } ) );
  } );
} );
