import * as undici from 'undici';
import { randomUUID } from 'node:crypto';
import { logRequest, logResponse, logError, logFailure } from './utils.js';

export { undici };

/**
 * Undici `fetch` with tracing: assigns `x-request-id`, logs the request/response (and errors) via `@outputai/core`.
 *
 * @param {import('undici').RequestInfo} input - URL string, `URL`, or `Request` (same as global `fetch`).
 * @param {import('undici').RequestInit} [init] - Request options
 * @returns {Promise<import('undici').Response>}
 */
export const fetch = async ( input, init = {} ) => {
  const requestId = randomUUID();

  const base = new undici.Request( input, init );
  // A RequestInit `headers` object replaces the full header list; merge so caller headers are kept.
  const headers = new undici.Headers( base.headers );
  headers.set( 'x-request-id', requestId );
  const request = new undici.Request( base, { headers } );

  await logRequest( { requestId, request } );

  try {
    const response = await undici.fetch( request );
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
