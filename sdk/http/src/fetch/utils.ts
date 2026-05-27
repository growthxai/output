import type { Request, Response, Headers } from 'undici';
import { requestIdSymbol } from '../consts.js';

/**
 * Header names that look sensitive by substring rules but are not secret material.
 */
const HEADER_REDACTION_EXEMPT = new Set( [
  'x-csrf-token',
  'public-key-pins'
] );

/** Matches red int "hot-red-pie", but not int "redact" */
const wordMatcher = ( term : string ) => new RegExp( `(?<![a-z\\d])${term}(?![a-z\\d])`, 'i' );

/** Matches red in "acquired", but not in "redact" */
const wordEndMatcher = ( term : string ) => new RegExp( `${term}(?![a-z\\d])`, 'i' );

/**
 * Sensitive header patterns for redaction (case-insensitive).
 * Uses alphanumeric boundaries so e.g. `token` does not match inside `tokens`.
 */
const SENSITIVE_HEADER_PATTERNS : RegExp[] = [
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
 * @param error Error to serialize
 * @param depth Current recursion depth for the error.cause chain
 * @returns Object
 */
export const serializeError = ( error: Error, depth : number = 1 ) => ( {
  name: error.constructor.name,
  message: error.message,
  stack: error.stack,
  code: ( error as { code?: string } ).code ?? undefined,
  cause: ( () : object | string | undefined => {
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
 * @param headers
 * @returns Plain object with sensitive headers redacted
 */
export const redactHeaders = ( headers: Headers ) : Record<string, unknown> => {
  const result : Record<string, unknown> = {};
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
 * @param r
 * @returns Parsed JSON value or raw body string
 */
export const parseBody = async ( r : Request | Response ) : Promise<string | object> => {
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
 * Tag a response with its request id so downstream code (e.g. addRequestCost)
 * can correlate. Stores the id under a private symbol AND patches `clone()` so
 * the tag propagates to clones — ky clones the response before invoking
 * `afterResponse` hooks, and undici headers are immutable on received
 * responses, so a symbol re-attached inside `clone()` is the only path that
 * survives.
 */
export const addRequestIdToResponse = ( response: Response, requestId: string ) : Response => {
  Object.defineProperty( response, requestIdSymbol, { value: requestId, enumerable: false, configurable: false, writable: false } );
  const originalClone = response.clone.bind( response );
  Object.defineProperty( response, 'clone', {
    value: function clone() {
      return addRequestIdToResponse( originalClone(), requestId );
    },
    enumerable: false,
    configurable: true,
    writable: true
  } );
  return response;
};
