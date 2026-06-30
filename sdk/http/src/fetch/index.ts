import * as undici from 'undici';
import { randomUUID } from 'node:crypto';
import { logRequest, logResponse, logError, logFailure } from './logger.js';
import type { RequestInfo, RequestInit } from 'undici';
import { addRequestIdToResponse } from './utils.js';
import { Proxy } from '@outputai/core/sdk/runtime';

/** Custom dispatcher to avoid h2 problems [OUT-505]. Preserved proxy if set up */
const customDispatcher = new undici[Proxy.getProxyUrl() ? 'EnvHttpProxyAgent' : 'Agent']( { allowH2: false } );

/*
 * Unifies undici and nodes realms
 * https://github.com/nodejs/undici#keep-fetch-and-formdata-together
 */
undici.install();

/** Re-export undici library for convenience. */
export * as undici from 'undici';

/** Export fetch input types. Also available under in undici.* export. */
export type {
  /** Undici's fetch first argument: Either a URL string, a URL object or a undici.Request object. */
  RequestInfo,
  /** Undici's fetch second argument: A plain object containing HTTP options. */
  RequestInit
};

/**
 * A fetch compliant function, that wraps undici's fetch.
 *
 * Behaves the same as any fetch function except:
 * - Sets a request header called `x-request--trace-id` with a random UUID;
 * - Sends the request, response, error and/or failure to the Trace system;
 * - Emits a `http:request` event on every call (success, error, failure).
 *
 * @see {@link https://fetch.spec.whatwg.org/}
 * @param input - URL string, URL object or Request object (undici's or Node's)
 * @param init - Request options
 * @returns The HTTP response
 */
export const fetch = async ( input: RequestInfo | Request, init?: RequestInit ) : Promise<Response> => {
  // Creates a Request object with the many shapes RequestInfo can have
  const base = new undici.Request( input as RequestInfo, init );
  // Creates a headers object with the many shapes Request.Headers can have (object, array, Headers)
  const headers = new undici.Headers( base.headers );

  const requestId = randomUUID();
  headers.set( 'x-request-trace-id', requestId );
  const request = new undici.Request( base, { headers } );

  const method = request.method;
  const url = request.url;
  const startedAt = performance.now();

  await logRequest( { requestId, request } );

  const dispatcher = init?.dispatcher ?? customDispatcher;
  try {
    const response = await undici.fetch( request, dispatcher ? { dispatcher } : undefined );
    const durationMs = performance.now() - startedAt;

    // This enriches the response of the request id, so it is identifiable later.
    addRequestIdToResponse( response, requestId );

    if ( response.status > 399 ) {
      await logError( { requestId, response, method, url, durationMs } );
      return response;
    }
    await logResponse( { requestId, response, method, url, durationMs } );
    return response;
  } catch ( error ) {
    const durationMs = performance.now() - startedAt;
    logFailure( { requestId, error: error as Error, method, url, durationMs } );
    throw error;
  }
};
