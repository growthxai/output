import { gcm } from '@noble/ciphers/aes.js';
import { managedNonce, randomBytes, hexToBytes, bytesToHex } from '@noble/ciphers/utils.js';

const aes = managedNonce( gcm );

export const generateKey = (): string => bytesToHex( randomBytes( 32 ) );

export const encrypt = ( plaintext: string, keyHex: string ): string =>
  Buffer.from( aes( hexToBytes( keyHex ) ).encrypt( new TextEncoder().encode( plaintext ) ) ).toString( 'base64' );

export const decrypt = ( ciphertext: string, keyHex: string ): string =>
  new TextDecoder().decode( aes( hexToBytes( keyHex ) ).decrypt( Buffer.from( ciphertext, 'base64' ) ) );
