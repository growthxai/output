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
      return serializeError( error.cause );
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
 * Clones a Request or Response object and parses its body based on its content type:
 * - application/json: object
 * - text/plain: string
 *
 * @param r
 * @returns Parsed body (JSON or text)
 */
export const parseBody = async ( r : Request | Response ) : Promise<string | object> => {
  const clone = r.clone();
  const contentType = clone.headers.get( 'content-type' ) || '';
  return clone[contentType.includes( 'application/json' ) ? 'json' : 'text']() as Promise<string | object>;
};
