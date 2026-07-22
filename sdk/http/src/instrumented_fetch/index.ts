import { randomUUID } from 'node:crypto';
import { logRequest, logResponse, logError, logFailure } from './logger.js';
import { emitSuccess, emitError, emitFailure } from './events.js';
import { addRequestIdToResponse } from './utils.js';
import * as undici from 'undici';

/* Ignore HTTP/2. Check: https://github.com/growthxai/output/issues/299 */
const customDispatcher = new undici.EnvHttpProxyAgent( { allowH2: false } );

type NodeRequestInfo = string | URL | globalThis.Request;
type NodeRequestInit = globalThis.RequestInit & Pick<undici.RequestInit, 'dispatcher'>;
type InstrumentedRequestInfo = NodeRequestInfo | undici.RequestInfo;
type InstrumentedRequestInit = NodeRequestInit | undici.RequestInit;

type InstrumentedFetch = {
  ( input: NodeRequestInfo, init?: NodeRequestInit ): Promise<Response>;
  ( input: undici.RequestInfo, init?: undici.RequestInit ): Promise<Response>;
};

const createUndiciRequest = ( input: InstrumentedRequestInfo, init?: InstrumentedRequestInit ): undici.Request => {
  const isNodeRequest = input instanceof globalThis.Request;
  const hasNodeFormData = init?.body instanceof globalThis.FormData;
  const isUndiciRequest = input instanceof undici.Request;
  const hasUndiciFormData = init?.body instanceof undici.FormData;

  if ( ( isNodeRequest && hasUndiciFormData ) || ( isUndiciRequest && hasNodeFormData ) ) {
    throw new TypeError( 'Cannot mix Node and Undici Request/FormData realms.' );
  }

  if ( !isNodeRequest && !hasNodeFormData ) {
    return new undici.Request( input as undici.RequestInfo, init as undici.RequestInit );
  }

  const request = new globalThis.Request( input as NodeRequestInfo, init as globalThis.RequestInit );
  return new undici.Request( request.url, request as unknown as undici.RequestInit );
};

/**
 * A fetch compliant function, that wraps undici's fetch.
 *
 * Behaves the same as any fetch function except:
 * - Sets a request header called `x-request-trace-id` with a random UUID;
 * - Sends the request, response, error and/or failure to the Trace system;
 * - Emits a `http:request` event on every call (success, error, failure).
 *
 * @see {@link https://fetch.spec.whatwg.org/}
 * @param input - URL string, URL object or Request object (undici's or Node's)
 * @param init - Request options
 * @returns The HTTP response
 */
export const instrumentedFetch: InstrumentedFetch = async (
  input: InstrumentedRequestInfo,
  init?: InstrumentedRequestInit
): Promise<Response> => {
  const { dispatcher: inputDispatcher, ...requestInit } = ( init ?? {} ) as undici.RequestInit;

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
