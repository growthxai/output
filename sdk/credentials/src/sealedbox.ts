import { concatBytes, bytesToHex, hexToBytes } from '@noble/ciphers/utils.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { load as parseYaml, dump as stringifyYaml } from 'js-yaml';
import { aesGcm } from './encryption.js';
import {
  MalformedCredentialsKeyError,
  SealedRecipientMismatchError,
  SealedValueError
} from './errors.js';

/**
 * Asymmetric ("sealed") credentials.
 *
 * Each credential value is sealed individually to a recipient X25519 public key
 * using a libsodium `crypto_box_seal`-style construction: an ephemeral X25519
 * keypair performs ECDH with the recipient public key, HKDF-SHA256 derives an
 * AES-256-GCM key, and the value is encrypted under it. The ephemeral public key
 * is prepended to the ciphertext so the recipient (holder of the private key) can
 * reconstruct the shared secret.
 *
 * The win over the symmetric scheme: sealing needs only the *public* key, so
 * adding a credential never requires a secret on the contributor's machine, and
 * the public key (the encryption identity) is committed to the repo — there is no
 * secret encryption key to misconfigure.
 */

export const SEALED_FORMAT = 'sealed-v1';
export const SEALED_PREFIX = 'sealed:';
export const FORMAT_FIELD = '__format__';
export const RECIPIENT_FIELD = '__recipient__';

const HKDF_INFO = new TextEncoder().encode( 'output-sealed-v1' );
const EPHEMERAL_KEY_BYTES = 32;
const GCM_NONCE_BYTES = 12;
const GCM_TAG_BYTES = 16;
/** Smallest possible sealed body: ephemeral pubkey + managed nonce + GCM tag (empty plaintext). */
const SEALED_MIN_BYTES = EPHEMERAL_KEY_BYTES + GCM_NONCE_BYTES + GCM_TAG_BYTES;
const KEY_HEX_PATTERN = /^[0-9a-fA-F]{64}$/;

export interface Keypair {
  publicKey: string;
  privateKey: string;
}

export interface SealedDocument {
  recipient: string;
  data: Record<string, unknown>;
}

export const generateKeypair = (): Keypair => {
  const privateKey = x25519.utils.randomSecretKey();
  return {
    privateKey: bytesToHex( privateKey ),
    publicKey: bytesToHex( x25519.getPublicKey( privateKey ) )
  };
};

export const publicKeyFromPrivate = ( privateKeyHex: string ): string =>
  bytesToHex( x25519.getPublicKey( hexToBytes( privateKeyHex ) ) );

export const isValidKeyHex = ( keyHex: string ): boolean => KEY_HEX_PATTERN.test( keyHex );

const deriveKey = ( shared: Uint8Array, ephemeralPub: Uint8Array, recipientPub: Uint8Array ): Uint8Array =>
  hkdf( sha256, shared, concatBytes( ephemeralPub, recipientPub ), HKDF_INFO, 32 );

/** Seal a single plaintext value to a recipient public key. Returns a `sealed:` token. */
export const seal = ( plaintext: string, recipientPublicKeyHex: string ): string => {
  if ( !isValidKeyHex( recipientPublicKeyHex ) ) {
    throw new Error( `Invalid recipient public key (expected 64 hex characters): "${recipientPublicKeyHex}".` );
  }

  const recipientPub = hexToBytes( recipientPublicKeyHex );
  const ephemeralSecret = x25519.utils.randomSecretKey();
  const ephemeralPub = x25519.getPublicKey( ephemeralSecret );
  const shared = x25519.getSharedSecret( ephemeralSecret, recipientPub );
  const key = deriveKey( shared, ephemeralPub, recipientPub );
  const ciphertext = aesGcm( key ).encrypt( new TextEncoder().encode( plaintext ) );
  return SEALED_PREFIX + Buffer.from( concatBytes( ephemeralPub, ciphertext ) ).toString( 'base64' );
};

/** Open a `sealed:` token with the recipient private key. */
export const open = ( token: string, recipientPrivateKeyHex: string ): string => {
  const body = token.startsWith( SEALED_PREFIX ) ? token.slice( SEALED_PREFIX.length ) : token;
  const raw = new Uint8Array( Buffer.from( body, 'base64' ) );

  if ( raw.length < SEALED_MIN_BYTES ) {
    throw new Error( `Malformed sealed token: ${raw.length} bytes, expected at least ${SEALED_MIN_BYTES}.` );
  }

  const ephemeralPub = raw.subarray( 0, EPHEMERAL_KEY_BYTES );
  const ciphertext = raw.subarray( EPHEMERAL_KEY_BYTES );
  const recipientPriv = hexToBytes( recipientPrivateKeyHex );
  const recipientPub = x25519.getPublicKey( recipientPriv );
  const shared = x25519.getSharedSecret( recipientPriv, ephemeralPub );
  const key = deriveKey( shared, ephemeralPub, recipientPub );
  return new TextDecoder().decode( aesGcm( key ).decrypt( ciphertext ) );
};

/** True when a value merely *looks* sealed (has the prefix) — used to decide whether to attempt opening. */
export const isSealedValue = ( value: unknown ): value is string =>
  typeof value === 'string' && value.startsWith( SEALED_PREFIX );

/**
 * True when a value is structurally a sealed token: the prefix plus a base64 body
 * large enough to hold the ephemeral key, nonce, and GCM tag. Used by {@link resealTree}
 * to recognize a genuine *previous* token worth preserving — never to decide whether an
 * incoming value is plaintext (the seal paths always treat their input as plaintext).
 */
const isWellFormedSealedToken = ( value: unknown ): value is string =>
  typeof value === 'string' &&
  value.startsWith( SEALED_PREFIX ) &&
  Buffer.from( value.slice( SEALED_PREFIX.length ), 'base64' ).length >= SEALED_MIN_BYTES;

const isPlainObject = ( value: unknown ): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray( value );

/**
 * Recursively seal every string leaf of a *plaintext* credential tree. Every string is
 * sealed unconditionally — the tree is assumed to be plaintext, so a value that merely
 * starts with `sealed:` is sealed like any other rather than written to disk in the clear.
 * To re-seal while preserving unchanged ciphertext, use {@link resealTree}.
 */
export const sealTree = ( tree: Record<string, unknown>, recipientPublicKeyHex: string ): Record<string, unknown> => {
  const out: Record<string, unknown> = {};

  for ( const [ key, value ] of Object.entries( tree ) ) {
    if ( isPlainObject( value ) ) {
      out[key] = sealTree( value, recipientPublicKeyHex );
    } else if ( typeof value === 'string' ) {
      out[key] = seal( value, recipientPublicKeyHex );
    } else {
      out[key] = value;
    }
  }

  return out;
};

const safeOpen = ( token: string, recipientPrivateKeyHex: string ): string | null => {
  try {
    return open( token, recipientPrivateKeyHex );
  } catch {
    return null;
  }
};

/**
 * Re-seal a plaintext tree against a `previous` sealed tree, preserving the existing
 * token for any leaf whose plaintext is unchanged. Because each {@link seal} uses a
 * fresh ephemeral key, blindly re-sealing rewrites every value's ciphertext; this keeps
 * an edit's git diff scoped to the values that actually changed. Requires the private
 * key to compare previous values; callers without a key should use {@link sealTree}.
 */
export const resealTree = (
  tree: Record<string, unknown>,
  previous: Record<string, unknown>,
  recipientPublicKeyHex: string,
  recipientPrivateKeyHex: string
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};

  for ( const [ key, value ] of Object.entries( tree ) ) {
    const prev = previous[key];

    if ( isPlainObject( value ) ) {
      out[key] = resealTree( value, isPlainObject( prev ) ? prev : {}, recipientPublicKeyHex, recipientPrivateKeyHex );
    } else if ( typeof value === 'string' ) {
      // value is plaintext: reuse the previous token only when it decrypts to the same
      // plaintext; otherwise seal afresh. The incoming value is never stored verbatim.
      out[key] = isWellFormedSealedToken( prev ) && safeOpen( prev, recipientPrivateKeyHex ) === value ?
        prev :
        seal( value, recipientPublicKeyHex );
    } else {
      out[key] = value;
    }
  }

  return out;
};

/** Recursively open every sealed leaf of a credential tree. Non-sealed values pass through. */
export const openTree = ( tree: Record<string, unknown>, recipientPrivateKeyHex: string ): Record<string, unknown> => {
  const out: Record<string, unknown> = {};

  for ( const [ key, value ] of Object.entries( tree ) ) {
    if ( isPlainObject( value ) ) {
      out[key] = openTree( value, recipientPrivateKeyHex );
    } else if ( isSealedValue( value ) ) {
      out[key] = open( value, recipientPrivateKeyHex );
    } else {
      out[key] = value;
    }
  }

  return out;
};

/** True when an already-parsed YAML value carries the sealed-document header. */
export const isSealedParsed = ( parsed: unknown ): parsed is Record<string, unknown> =>
  isPlainObject( parsed ) && parsed[FORMAT_FIELD] === SEALED_FORMAT;

/** Returns `'sealed-v1'` when the file is a sealed document, otherwise `'legacy'` (symmetric blob). */
export const detectFormat = ( content: string ): typeof SEALED_FORMAT | 'legacy' => {
  try {
    if ( isSealedParsed( parseYaml( content ) ) ) {
      return SEALED_FORMAT;
    }
  } catch {
    // A legacy file is a single base64 blob; treat any parse failure as legacy.
  }

  return 'legacy';
};

/** Split a parsed sealed-document object into its recipient and (still-sealed) credential tree. */
const splitSealedHeader = ( parsed: Record<string, unknown> ): SealedDocument => {
  const recipient = parsed[RECIPIENT_FIELD];
  const data = { ...parsed };
  delete data[FORMAT_FIELD];
  delete data[RECIPIENT_FIELD];

  return { recipient: typeof recipient === 'string' ? recipient : '', data };
};

/** Parse a sealed document into its recipient public key and the (still-sealed) credential tree. */
export const parseSealedDocument = ( content: string ): SealedDocument => {
  const parsed = parseYaml( content );

  if ( !isPlainObject( parsed ) ) {
    throw new Error( 'Sealed credentials file is not a valid YAML document.' );
  }

  return splitSealedHeader( parsed );
};

/**
 * Open a parsed sealed document, applying every integrity check in one place: the
 * private key must be well-formed, the recipient is mandatory and must match the key,
 * and each value must decrypt. This is the single source of truth shared by the runtime
 * provider and the CLI so they cannot diverge on which files are openable.
 */
export const openSealedParsed = (
  parsed: Record<string, unknown>,
  privateKeyHex: string,
  credPath: string
): Record<string, unknown> => {
  if ( !isValidKeyHex( privateKeyHex ) ) {
    throw new MalformedCredentialsKeyError( credPath, 'expected 64 hex characters' );
  }

  const { recipient, data } = splitSealedHeader( parsed );

  if ( !recipient ) {
    throw new SealedValueError( credPath, 'the file has no __recipient__ public key' );
  }

  const derivedRecipient = publicKeyFromPrivate( privateKeyHex );
  if ( recipient !== derivedRecipient ) {
    throw new SealedRecipientMismatchError( credPath, derivedRecipient, recipient );
  }

  try {
    return openTree( data, privateKeyHex );
  } catch ( error ) {
    throw new SealedValueError( credPath, error instanceof Error ? error.message : String( error ) );
  }
};

/** Open a sealed document from its serialized content. Convenience wrapper over {@link openSealedParsed}. */
export const openSealedDocument = (
  content: string,
  privateKeyHex: string,
  credPath: string
): Record<string, unknown> => {
  const parsed = parseYaml( content );

  if ( !isPlainObject( parsed ) ) {
    throw new SealedValueError( credPath, 'the file is not a valid sealed YAML document' );
  }

  return openSealedParsed( parsed, privateKeyHex, credPath );
};

/** Serialize a sealed document (format + recipient header followed by the sealed credential tree). */
export const serializeSealedDocument = ( recipient: string, data: Record<string, unknown> ): string =>
  stringifyYaml( { [FORMAT_FIELD]: SEALED_FORMAT, [RECIPIENT_FIELD]: recipient, ...data } );
