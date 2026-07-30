/**
 * Redacts a given URL object by setting each search param, hash, username and password to '***'
 * @param {URL|string} target
 * @returns {string} Redacted URL as a string
 */
export const redactUrl = target => {
  const url = new URL( target );
  url.search = new URLSearchParams( url.searchParams.entries().map( ( [ p ] ) => [ p, '***' ] ) ).toString();
  url.username = url.username.length > 0 ? '***' : '';
  url.password = url.password.length > 0 ? '***' : '';
  url.hash = url.hash ? '#***' : '';
  return url.toString();
};

/** Matches red in "hot-red-pie", but not in "redact" */
const wordMatcher = term => new RegExp( `(?<![a-z\\d])${term}(?![a-z\\d])`, 'i' );

/** Matches red in "acquired", but not in "redact" */
const wordEndMatcher = term => new RegExp( `${term}(?![a-z\\d])`, 'i' );

/**
 * Redacts sensitive headers
 * @param {object} headers
 * @returns {object} The redacted headers
 */
export const redactHeaders = headers => {
  /** Header names that look sensitive by substring rules but are not secret material. */
  const ignoreHeaders = new Set( [
    'x-csrf-token',
    'public-key-pins'
  ] );

  /** * Sensitive header patterns for redaction (case-insensitive). */
  const sensitiveHeadersPatterns = [
    // matches headers that contain these exact words
    wordMatcher( 'authorization' ),
    wordMatcher( 'token' ),
    wordMatcher( 'secret' ),
    wordMatcher( 'password' ),
    wordMatcher( 'pwd' ),
    wordMatcher( 'cookie' ),
    // matches header that contain words ending with these sequences
    wordEndMatcher( 'key' )
  ];

  return Object.entries( headers ).reduce( ( redacted, [ key, value ] ) => {
    const lowKey = key.toLowerCase();
    const isSensitive = !ignoreHeaders.has( lowKey ) && sensitiveHeadersPatterns.some( rx => rx.test( lowKey ) );
    return Object.assign( redacted, { [key]: isSensitive ? '[REDACTED]' : value } );
  }, {} );
};
