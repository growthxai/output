import { gcm } from '@noble/ciphers/aes.js';
import { managedNonce, randomBytes, hexToBytes, bytesToHex } from '@noble/ciphers/utils.js';

/**
 * Shared AES-256-GCM primitive with a random managed nonce. Exported so the sealed
 * (asymmetric) scheme reuses the exact same AEAD construction — a single source of
 * truth keeps the on-disk ciphertext format consistent across symmetric and sealed.
 */
export const aesGcm = managedNonce( gcm );

export const generateKey = (): string => bytesToHex( randomBytes( 32 ) );

export const encrypt = ( plaintext: string, keyHex: string ): string =>
  Buffer.from( aesGcm( hexToBytes( keyHex ) ).encrypt( new TextEncoder().encode( plaintext ) ) ).toString( 'base64' );

export const decrypt = ( ciphertext: string, keyHex: string ): string =>
  new TextDecoder().decode( aesGcm( hexToBytes( keyHex ) ).decrypt( Buffer.from( ciphertext, 'base64' ) ) );
