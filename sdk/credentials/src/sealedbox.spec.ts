import { describe, it, expect } from 'vitest';
import {
  generateKeypair,
  publicKeyFromPrivate,
  isValidKeyHex,
  seal,
  open,
  sealTree,
  openTree,
  resealTree,
  openSealedDocument,
  isSealedValue,
  detectFormat,
  parseSealedDocument,
  serializeSealedDocument,
  SEALED_PREFIX,
  SEALED_FORMAT
} from './sealedbox.js';
import { SealedRecipientMismatchError, SealedValueError, MalformedCredentialsKeyError } from './errors.js';

describe( 'sealedbox', () => {
  describe( 'generateKeypair', () => {
    it( 'should return 64-char hex private and public keys', () => {
      const { privateKey, publicKey } = generateKeypair();

      expect( privateKey ).toMatch( /^[0-9a-f]{64}$/ );
      expect( publicKey ).toMatch( /^[0-9a-f]{64}$/ );
      expect( privateKey ).not.toBe( publicKey );
    } );

    it( 'should produce unique keypairs', () => {
      const keys = Array.from( { length: 10 }, () => generateKeypair().privateKey );

      expect( new Set( keys ).size ).toBe( 10 );
    } );
  } );

  describe( 'publicKeyFromPrivate', () => {
    it( 'should derive the keypair public key from its private key', () => {
      const { privateKey, publicKey } = generateKeypair();

      expect( publicKeyFromPrivate( privateKey ) ).toBe( publicKey );
    } );
  } );

  describe( 'isValidKeyHex', () => {
    it( 'should accept 64 hex chars and reject anything else', () => {
      expect( isValidKeyHex( 'a'.repeat( 64 ) ) ).toBe( true );
      expect( isValidKeyHex( 'a'.repeat( 63 ) ) ).toBe( false );
      expect( isValidKeyHex( 'z'.repeat( 64 ) ) ).toBe( false );
      expect( isValidKeyHex( '' ) ).toBe( false );
    } );
  } );

  describe( 'seal + open', () => {
    it( 'should round-trip a value with the recipient keypair', () => {
      const { privateKey, publicKey } = generateKeypair();
      const token = seal( 'sk-ant-secret', publicKey );

      expect( token.startsWith( SEALED_PREFIX ) ).toBe( true );
      expect( open( token, privateKey ) ).toBe( 'sk-ant-secret' );
    } );

    it( 'should handle empty and unicode values', () => {
      const { privateKey, publicKey } = generateKeypair();

      expect( open( seal( '', publicKey ), privateKey ) ).toBe( '' );
      expect( open( seal( 'sk-🔑-日本語', publicKey ), privateKey ) ).toBe( 'sk-🔑-日本語' );
    } );

    it( 'should produce different tokens for the same value (ephemeral key)', () => {
      const { publicKey } = generateKeypair();

      expect( seal( 'same', publicKey ) ).not.toBe( seal( 'same', publicKey ) );
    } );

    it( 'should fail to open with the wrong private key', () => {
      const { publicKey } = generateKeypair();
      const wrong = generateKeypair().privateKey;

      expect( () => open( seal( 'secret', publicKey ), wrong ) ).toThrow();
    } );

    it( 'should fail to open a tampered token', () => {
      const { privateKey, publicKey } = generateKeypair();
      const token = seal( 'secret', publicKey );
      const raw = Buffer.from( token.slice( SEALED_PREFIX.length ), 'base64' );
      raw[raw.length - 1] = ( raw[raw.length - 1] + 1 ) % 256;
      const tampered = SEALED_PREFIX + raw.toString( 'base64' );

      expect( () => open( tampered, privateKey ) ).toThrow();
    } );

    it( 'should reject a recipient public key that is not 64 hex chars', () => {
      expect( () => seal( 'secret', 'not-a-key' ) ).toThrow( /Invalid recipient public key/ );
      expect( () => seal( 'secret', 'a'.repeat( 63 ) ) ).toThrow( /Invalid recipient public key/ );
    } );

    it( 'should reject a truncated token instead of producing garbage', () => {
      const { privateKey } = generateKeypair();
      const truncated = SEALED_PREFIX + Buffer.from( 'too-short' ).toString( 'base64' );

      expect( () => open( truncated, privateKey ) ).toThrow( /Malformed sealed token/ );
    } );
  } );

  describe( 'isSealedValue', () => {
    it( 'should detect sealed tokens', () => {
      expect( isSealedValue( `${SEALED_PREFIX}abc` ) ).toBe( true );
      expect( isSealedValue( 'plain' ) ).toBe( false );
      expect( isSealedValue( 42 ) ).toBe( false );
      expect( isSealedValue( null ) ).toBe( false );
    } );
  } );

  describe( 'sealTree + openTree', () => {
    it( 'should round-trip a nested credential tree', () => {
      const { privateKey, publicKey } = generateKeypair();
      const tree = {
        anthropic: { api_key: 'sk-ant' },
        aws: { access_key_id: 'AKIA', secret_access_key: 'shh', region: 'us-east-1' }
      };

      const sealed = sealTree( tree, publicKey );

      expect( isSealedValue( ( sealed.anthropic as Record<string, unknown> ).api_key ) ).toBe( true );
      expect( openTree( sealed, privateKey ) ).toEqual( tree );
    } );

    it( 'should seal every string leaf unconditionally (input is plaintext)', () => {
      const { privateKey, publicKey } = generateKeypair();
      // A value that already looks like a token is treated as plaintext and sealed,
      // so it is never written to disk in the clear.
      const sealed = sealTree( { a: `${SEALED_PREFIX}${'A'.repeat( 120 )}` }, publicKey );

      expect( sealed.a ).not.toContain( 'A'.repeat( 120 ) );
      expect( open( sealed.a as string, privateKey ) ).toBe( `${SEALED_PREFIX}${'A'.repeat( 120 )}` );
    } );

    it( 'should pass through non-string leaves untouched', () => {
      const { publicKey } = generateKeypair();
      const sealed = sealTree( { n: 7, b: true }, publicKey );

      expect( sealed.n ).toBe( 7 );
      expect( sealed.b ).toBe( true );
    } );

    it( 'should seal a plaintext value that merely starts with "sealed:"', () => {
      const { privateKey, publicKey } = generateKeypair();
      const sealed = sealTree( { token: 'sealed:prod-db' }, publicKey );

      // The look-alike plaintext must be encrypted, not stored verbatim.
      expect( sealed.token ).not.toBe( 'sealed:prod-db' );
      expect( open( sealed.token as string, privateKey ) ).toBe( 'sealed:prod-db' );
    } );
  } );

  describe( 'resealTree', () => {
    it( 'should keep the existing token for unchanged values and re-seal only changes', () => {
      const { privateKey, publicKey } = generateKeypair();
      const previous = sealTree( { a: { x: 'one', y: 'two' } }, publicKey );

      const next = resealTree(
        { a: { x: 'one', y: 'CHANGED' } },
        previous,
        publicKey,
        privateKey
      );

      const prevInner = previous.a as Record<string, unknown>;
      const nextInner = next.a as Record<string, unknown>;

      // Unchanged value keeps the same ciphertext (no diff churn); changed value is re-sealed.
      expect( nextInner.x ).toBe( prevInner.x );
      expect( nextInner.y ).not.toBe( prevInner.y );
      expect( openTree( next, privateKey ) ).toEqual( { a: { x: 'one', y: 'CHANGED' } } );
    } );

    it( 'should seal a new "sealed:"-lookalike plaintext rather than storing it verbatim', () => {
      const { privateKey, publicKey } = generateKeypair();
      const lookalike = `${SEALED_PREFIX}${'A'.repeat( 120 )}`;

      const next = resealTree( { k: lookalike }, {}, publicKey, privateKey );

      expect( next.k ).not.toBe( lookalike );
      expect( open( next.k as string, privateKey ) ).toBe( lookalike );
    } );
  } );

  describe( 'detectFormat', () => {
    it( 'should detect sealed documents', () => {
      const { publicKey } = generateKeypair();
      const doc = serializeSealedDocument( publicKey, sealTree( { a: 'x' }, publicKey ) );

      expect( detectFormat( doc ) ).toBe( SEALED_FORMAT );
    } );

    it( 'should treat a base64 blob as legacy', () => {
      expect( detectFormat( Buffer.from( 'anything' ).toString( 'base64' ) ) ).toBe( 'legacy' );
    } );
  } );

  describe( 'parseSealedDocument + serializeSealedDocument', () => {
    it( 'should round-trip recipient and data, stripping header fields', () => {
      const { publicKey } = generateKeypair();
      const data = sealTree( { anthropic: { api_key: 'sk' } }, publicKey );
      const doc = serializeSealedDocument( publicKey, data );

      const parsed = parseSealedDocument( doc );

      expect( parsed.recipient ).toBe( publicKey );
      expect( parsed.data ).toEqual( data );
      expect( parsed.data.__format__ ).toBeUndefined();
      expect( parsed.data.__recipient__ ).toBeUndefined();
    } );
  } );

  describe( 'openSealedDocument', () => {
    const credPath = '/tmp/credentials.yml.enc';

    it( 'should open a valid document with the matching private key', () => {
      const { privateKey, publicKey } = generateKeypair();
      const doc = serializeSealedDocument( publicKey, sealTree( { db: { password: 'shh' } }, publicKey ) );

      expect( openSealedDocument( doc, privateKey, credPath ) ).toEqual( { db: { password: 'shh' } } );
    } );

    it( 'should throw MalformedCredentialsKeyError for a non-hex key', () => {
      const { publicKey } = generateKeypair();
      const doc = serializeSealedDocument( publicKey, sealTree( { a: 'x' }, publicKey ) );

      expect( () => openSealedDocument( doc, 'too-short', credPath ) ).toThrow( MalformedCredentialsKeyError );
    } );

    it( 'should throw SealedRecipientMismatchError when the key is for a different keypair', () => {
      const { publicKey } = generateKeypair();
      const doc = serializeSealedDocument( publicKey, sealTree( { a: 'x' }, publicKey ) );

      expect( () => openSealedDocument( doc, generateKeypair().privateKey, credPath ) )
        .toThrow( SealedRecipientMismatchError );
    } );

    it( 'should fail closed when the __recipient__ header is missing instead of opening blindly', () => {
      const { privateKey, publicKey } = generateKeypair();
      const doc = serializeSealedDocument( '', sealTree( { a: 'x' }, publicKey ) );

      expect( () => openSealedDocument( doc, privateKey, credPath ) ).toThrow( SealedValueError );
    } );
  } );
} );
