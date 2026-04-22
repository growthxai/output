import type { Request, Response, Headers } from 'undici';

/**
 * Sensitive header patterns for redaction (case-insensitive)
 */
const SENSITIVE_HEADER_PATTERNS : RegExp[] = [
  /authorization/i,
  /token/i,
  /api-?key/i,
  /secret/i,
  /password/i,
  /pwd/i,
  /key/i,
  /cookie/i
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
    const isSensitive = SENSITIVE_HEADER_PATTERNS.some( pattern => pattern.test( key ) );
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
