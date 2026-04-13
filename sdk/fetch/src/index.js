import * as undici from 'undici';
import { randomUUID } from 'node:crypto';
import { logRequest, logResponse, logError, logFailure } from './utils.js';

/**
 * Re-exports undici.
 *
 * Custom fetch uses RequestInfo, RequestInit, Request and Response from this realm.
*/
export { undici };

const realm = undici;

/**
 * A fetch compliant function, that wraps undici's fetch.
 *
 * Behaves the same as any fetch function except:
 * - Adds `x-request-id` header to requests with random value (over-writable)
 * - Sends the request, response, error and/or failure to trace (from @outputai/core).
 *
 * @see {@link https://fetch.spec.whatwg.org/}
 * @param {import('undici').RequestInfo} input - URL string, URL object or Request object
 * @param {import('undici').RequestInit} [init] - Request init options
 * @returns {Promise<import('undici').Response>}
 */
export const fetch = async ( input, init = {} ) => {
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
    logFailure( { requestId, error } );
    throw error;
  }
};
