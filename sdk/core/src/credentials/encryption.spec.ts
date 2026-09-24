import { describe, it, expect } from 'vitest';
import { generateKey, encrypt, decrypt } from './encryption.js';

describe( 'encryption module', () => {
  describe( 'generateKey', () => {
    it( 'should return a 64-character hex string', () => {
      const key = generateKey();

      expect( key ).toHaveLength( 64 );
      expect( key ).toMatch( /^[0-9a-f]{64}$/ );
    } );

    it( 'should produce unique keys on each call', () => {
      const keys = Array.from( { length: 10 }, () => generateKey() );
      const unique = new Set( keys );

      expect( unique.size ).toBe( 10 );
    } );
  } );

  describe( 'encrypt + decrypt', () => {
    it( 'should round-trip plaintext correctly', () => {
      const key = generateKey();
      const plaintext = 'hello world: this is a secret!';

      const ciphertext = encrypt( plaintext, key );
      const decrypted = decrypt( ciphertext, key );

      expect( decrypted ).toBe( plaintext );
    } );

    it( 'should handle empty plaintext', () => {
      const key = generateKey();

      const ciphertext = encrypt( '', key );
      const decrypted = decrypt( ciphertext, key );

      expect( decrypted ).toBe( '' );
    } );

    it( 'should handle unicode content', () => {
      const key = generateKey();
      const plaintext = 'api_key: sk-ant-🔑\nregion: 日本語テスト';

      const ciphertext = encrypt( plaintext, key );
      const decrypted = decrypt( ciphertext, key );

      expect( decrypted ).toBe( plaintext );
    } );

    it( 'should produce a valid base64 string', () => {
      const key = generateKey();
      const ciphertext = encrypt( 'test', key );

      expect( () => Buffer.from( ciphertext, 'base64' ) ).not.toThrow();

      const decoded = Buffer.from( ciphertext, 'base64' );
      expect( decoded.length ).toBeGreaterThan( 28 );
    } );

    it( 'should produce different ciphertext for same plaintext + key (random IV)', () => {
      const key = generateKey();
      const plaintext = 'same content';

      const ct1 = encrypt( plaintext, key );
      const ct2 = encrypt( plaintext, key );

      expect( ct1 ).not.toBe( ct2 );

      expect( decrypt( ct1, key ) ).toBe( plaintext );
      expect( decrypt( ct2, key ) ).toBe( plaintext );
    } );
  } );

  describe( 'decrypt error cases', () => {
    it( 'should throw when decrypting with wrong key', () => {
      const key1 = generateKey();
      const key2 = generateKey();
      const ciphertext = encrypt( 'secret', key1 );

      expect( () => decrypt( ciphertext, key2 ) ).toThrow();
    } );

    it( 'should throw when ciphertext is too short', () => {
      const key = generateKey();

      const tooShort = Buffer.from( 'short' ).toString( 'base64' );
      expect( () => decrypt( tooShort, key ) ).toThrow();
    } );

    it( 'should throw when ciphertext has been tampered with', () => {
      const key = generateKey();
      const ciphertext = encrypt( 'secret', key );

      const buf = Buffer.from( ciphertext, 'base64' );
      buf[20] = ( buf[20] + 1 ) % 256;
      const tampered = buf.toString( 'base64' );

      expect( () => decrypt( tampered, key ) ).toThrow();
    } );
  } );
} );
