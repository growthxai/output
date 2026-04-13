import * as undici from 'undici';
import { randomUUID } from 'node:crypto';
import { logRequest, logResponse, logError, logFailure } from './utils.js';
import type { Response, RequestInfo, RequestInit } from 'undici';

/**
 * The full undici library.
 */
export * as undici from 'undici';

/**
 * Export fetch's input/output types.
 *
 * The realm of these types is undici, and they should not be confused with built-in Node.js types of the same name.
 *
 * The same types are available under undici.*.
 */
export type {
  /**
   * Undici fetch's response
   */
  Response,

  /**
   * Undici fetch's request info argument.
   *
   * It is either a URL string, a URL object or a undici.Request object.
   */
  RequestInfo,

  /**
   * Undici fetch's request init argument.
   *
   * It is plain object containing options.
   */
  RequestInit
};

const realm = undici;

/**
 * A fetch compliant function, that wraps undici's fetch.
 *
 * Behaves the same as any fetch function except:
 * - Adds `x-request-id` header to requests with random value (over-writable)
 * - Sends the request, response, error and/or failure to trace (from @outputai/core).
 *
 * @see {@link https://fetch.spec.whatwg.org/}
 * @param input - URL string, URL object or Request object
 * @param init - Request options
 * @returns The HTTP response
 */
export const fetch = async ( input: RequestInfo, init?: RequestInit ) : Promise<Response> => {
  const requestId = randomUUID();

  const base = new realm.Request( input, init );
  // A RequestInit `headers` object replaces the full header list; merge so caller headers are kept.
  const headers = new realm.Headers( base.headers );
  headers.set( 'x-request-id', requestId );
  const request = new realm.Request( base, { headers } );

  await logRequest( { requestId, request } );

  try {
    const response = await realm.fetch( request );
    if ( response.status > 399 ) {
      logError( { requestId, response } );
      return response;
    }
    await logResponse( { requestId, response } );
    return response;
  } catch ( error ) {
    logFailure( { requestId, error: error as Error } );
    throw error;
  }
};
