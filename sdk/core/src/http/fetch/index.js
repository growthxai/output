import { randomUUID } from 'node:crypto';
import { logRequest, logResponse, logError, logFailure } from './logger.js';
import { emitSuccess, emitError, emitFailure } from './events.js';
import { addRequestIdToResponse } from '../request_tag.js';
import * as undici from 'undici';

/* Ignore HTTP/2. Check: https://github.com/growthxai/output/issues/299 */
const customDispatcher = new undici.EnvHttpProxyAgent( { allowH2: false } );

const createUndiciRequest = ( input, init ) => {
  const isNodeRequest = input instanceof globalThis.Request;
  const hasNodeFormData = init?.body instanceof globalThis.FormData;
  const isUndiciRequest = input instanceof undici.Request;
  const hasUndiciFormData = init?.body instanceof undici.FormData;

  if ( ( isNodeRequest && hasUndiciFormData ) || ( isUndiciRequest && hasNodeFormData ) ) {
    throw new TypeError( 'Cannot mix Node and Undici Request/FormData realms.' );
  }

  if ( !isNodeRequest && !hasNodeFormData ) {
    return new undici.Request( input, init );
  }

  const request = new globalThis.Request( input, init );
  return new undici.Request( request.url, request );
};

/**
 * A fetch compliant function, that wraps undici's fetch.
 *
 * @param {RequestInfo} input - URL string, URL object or Request object (undici's or Node's)
 * @param {RequestInit} [init] - Request options
 * @returns {Promise<Response>} The HTTP response
 */
export const outputFetch = async ( input, init ) => {
  const { dispatcher: inputDispatcher, ...requestInit } = init ?? {};

  // Creates a Request object with the many shapes RequestInfo can have
  const base = createUndiciRequest( input, requestInit );

  // Creates a headers object with the many shapes Request.Headers can have (object, array, Headers)
  const headers = new undici.Headers( base.headers );

  const requestId = randomUUID();
  headers.set( 'x-request-trace-id', requestId );
  const request = new undici.Request( base, { headers } );

  const method = request.method;
  const url = request.url;
  const startedAt = Date.now();

  await logRequest( { requestId, request } );

  // this allows for users not only to override the dispatcher but also to define it as undefined and remove it altogether.
  const dispatcher = Object.hasOwn( init ?? {}, 'dispatcher' ) ? inputDispatcher : customDispatcher;
  try {
    const response = await undici.fetch( request, dispatcher ? { dispatcher } : undefined );
    const durationMs = Date.now() - startedAt;
    const { status } = response;

    // This enriches the response of the request id, so it is identifiable later.
    addRequestIdToResponse( response, requestId );

    if ( status > 399 ) {
      await logError( { requestId, response } );
      emitError( { requestId, method, url, status, durationMs } );
      return response;
    }
    await logResponse( { requestId, response } );
    emitSuccess( { requestId, method, url, status, durationMs } );
    return response;
  } catch ( error ) {
    const durationMs = Date.now() - startedAt;
    logFailure( { requestId, error } );
    emitFailure( { requestId, method, url, durationMs } );
    throw error;
  }
};
