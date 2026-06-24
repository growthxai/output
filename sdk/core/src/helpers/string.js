/**
 * Returns true if string value is stringbool and true
 * @param {string} v
 * @returns
 */
export const isStringboolTrue = v => [ '1', 'true', 'on' ].includes( v );

/**
 * Shortens a UUID by re-encoding it to base62.
 *
 * This is a Temporal friendly, without crypto or Buffer.
 * @param {string} uuid
 * @returns {string}
 */
export const toUrlSafeBase64 = uuid => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  const alphabetLen = alphabet.length;
  const base = BigInt( alphabetLen );
  const hex = uuid.replace( /-/g, '' );

  const toDigits = n => n <= 0n ? [] : toDigits( n / base ).concat( alphabet[Number( n % base )] );
  return toDigits( BigInt( '0x' + hex ) ).join( '' );
};

/**
 * Escape regexp characters in a string
 * @param {*} value
 * @returns
 */
export const rxEscape = v => v.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' );
