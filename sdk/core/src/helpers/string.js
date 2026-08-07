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

const URL_SCHEME_RX = /^[a-z][a-z\d+.-]*:\/\//i;

/**
 * Detects if string is an URL starting with `<protocol>://`
 *
 * @param {string} s
 * @returns {boolean}
 */
export const isUrl = s => typeof s === 'string' && URL_SCHEME_RX.test( s.trim() ) && URL.canParse( s );
