import { FatalError } from '#errors';
import { EnvHttpProxyAgent, fetch } from 'undici';
import { serializeResponse, serializeBodyAndInferContentType, hydrateHeaders } from '#helpers/fetch';
import { createChildLogger } from '#logger';
import { getDestinations } from '#tracing';
import { createInternalStep } from '#helpers/component';
import { ACTIVITY_GET_TRACE_DESTINATIONS, ACTIVITY_SEND_HTTP_REQUEST } from '#consts';

const log = createChildLogger( 'HttpClient' );

/* Ignore HTTP/2. Check: https://github.com/growthxai/output/issues/299 */
const dispatcher = new EnvHttpProxyAgent( { allowH2: false } );

/**
 * Send a HTTP request.
 *
 * @param {object} options
 * @param {string} options.url - The target url
 * @param {string} options.method - The HTTP method
 * @param {unknown} [options.payload] - The payload to send url
 * @param {object} [options.headers] - The headers for the request.
 * @param {number} [options.timeout] - The timeout for the request (default 30s)
 * @param {object} [options.responseOptions] - Options regarding the response
 * @param {boolean} [options.responseOptions.includeHeaders] - If the response will include the headers - Headers are always redacted (default false)
 * @param {boolean} [options.responseOptions.includeBody] - If the response will include the body (default false)
 * @returns {object} The serialized HTTP response
 * @throws {FatalError}
 */
export const sendHttpRequest = createInternalStep( {
  name: ACTIVITY_SEND_HTTP_REQUEST,
  handler: async ( { url, method, payload = undefined, headers = undefined, timeout = 30_000, responseOptions = {} } ) => {
    const args = {
      method,
      headers: new Headers( hydrateHeaders( headers ) ),
      signal: AbortSignal.timeout( timeout ),
      dispatcher
    };

    const methodsWithBody = [ 'DELETE', 'PATCH', 'POST', 'PUT', 'OPTIONS' ];
    const hasBodyPayload = ![ undefined, null ].includes( payload );
    if ( methodsWithBody.includes( method ) && hasBodyPayload ) {
      const { body, contentType } = serializeBodyAndInferContentType( payload );
      if ( contentType && !args.headers.has( 'content-type' ) ) {
        args.headers.set( 'Content-Type', contentType );
      }
      Object.assign( args, { body } );
    };

    const response = await ( async () => {
      try {
        return await fetch( url, args );
      } catch ( e ) {
        throw new FatalError( `${method} ${url} ${e.cause ?? e.message}` );
      }
    } )();

    log.info( 'HTTP request completed', { url, method, status: response.status, statusText: response.statusText } );

    if ( !response.ok ) {
      throw new FatalError( `${method} ${url} ${response.status}` );
    }

    return serializeResponse( response, responseOptions );
  }
} );

/**
 * Invokes a trace method that resolves all trace output paths based on the traceInfo
 *
 * @param {object} traceInfo
 * @returns {object} Information about enabled destinations
 */
export const getTraceDestinations = createInternalStep( {
  name: ACTIVITY_GET_TRACE_DESTINATIONS,
  handler: traceInfo => getDestinations( traceInfo )
} );
