import { requestIdSymbol } from '../consts.js';

/**
 * Header names that look sensitive by substring rules but are not secret material.
 */
const HEADER_REDACTION_EXEMPT = new Set( [
  'x-csrf-token',
  'public-key-pins'
] );

/** Matches red int "hot-red-pie", but not int "redact" */
const wordMatcher = term => new RegExp( `(?<![a-z\\d])${term}(?![a-z\\d])`, 'i' );

/** Matches red in "acquired", but not in "redact" */
const wordEndMatcher = term => new RegExp( `${term}(?![a-z\\d])`, 'i' );

/**
 * Sensitive header patterns for redaction (case-insensitive).
 * Uses alphanumeric boundaries so e.g. `token` does not match inside `tokens`.
 */
const SENSITIVE_HEADER_PATTERNS = [
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

/**
 * Serialize a given error to a plain object keeping main properties:
 * - name (from constructor.name)
 * - message
 * - stack
 * - code (optional, but present on Node errors)
 * - cause (error chain)
 *
 * @param {Error} error Error to serialize
 * @param {number} depth Current recursion depth for the error.cause chain
 * @returns Object
 */
export const serializeError = ( error, depth = 1 ) => ( {
  name: error.constructor.name,
  message: error.message,
  stack: error.stack,
  code: error?.code,
  cause: ( () => {
    if ( depth > 5 ) {
      return '<Max recursion depth reached>';
    }
    if ( error.cause instanceof Error ) {
      return serializeError( error.cause, depth + 1 );
    }
    return undefined; // eslint-disable-line consistent-return
  } )()
} );

/**
 * Redacts sensitive headers for safe logging
 *
 * @param {Headers} headers
 * @returns {object} Plain object with sensitive headers redacted
 */
export const redactHeaders = headers => {
  const result = {};
  for ( const [ key, value ] of headers.entries() ) {
    const lowerCaseKey = key.toLowerCase();
    const isSensitive = !HEADER_REDACTION_EXEMPT.has( lowerCaseKey ) &&
      SENSITIVE_HEADER_PATTERNS.some( pattern => pattern.test( key ) );
    result[key] = isSensitive ? '[REDACTED]' : value;
  }
  return result;
};

/**
 * Clones a Request or Response object and reads the body as text, then:
 * - non-JSON content-type, or empty body: returns the text as-is
 * - application/json with a non-empty body: returns JSON.parse result, or the raw text if parsing fails
 *
 * @param {Request|Response} r
 * @returns {object|string} Parsed JSON value or raw body string
 */
export const parseBody = async r => {
  const clone = r.clone();
  const contentType = clone.headers.get( 'content-type' ) || '';
  const textContent = await clone.text();
  if ( !contentType.includes( 'application/json' ) || textContent.length === 0 ) {
    return textContent;
  }

  try {
    return JSON.parse( textContent );
  } catch {
    return textContent;
  }
};

/**
 * Tag a response in place with its request id so downstream code (e.g.
 * `addRequestCost`) can correlate. Stores the id under a private symbol AND
 * patches `clone()` so the tag propagates to clones — ky clones the response
 * before invoking `afterResponse` hooks, and undici headers are immutable on
 * received responses, so a symbol re-attached inside `clone()` is the only
 * path that survives.
 *
 * @param {Response} response
 * @param {string} requestId
 */
export const addRequestIdToResponse = ( response, requestId ) => {
  Object.defineProperty( response, requestIdSymbol, { value: requestId, enumerable: false, configurable: false, writable: false } );
  const originalClone = response.clone.bind( response );
  Object.defineProperty( response, 'clone', {
    value: function clone() {
      const cloned = originalClone();
      addRequestIdToResponse( cloned, requestId );
      return cloned;
    },
    enumerable: false,
    configurable: true,
    writable: true
  } );
};
