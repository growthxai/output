import { FatalError } from '#errors';
import { fetch } from 'undici';
import { setMetadata, serializeFetchResponse, serializeBodyAndInferContentType } from '#utils';
import { ComponentType } from '#consts';
import { createChildLogger } from '#logger';
import { getDestinations } from '#tracing';

const log = createChildLogger( 'HttpClient' );

/**
 * Send a HTTP request.
 *
 * @param {object} options
 * @param {string} options.url - The target url
 * @param {string} options.method - The HTTP method
 * @param {unknown} [options.payload] - The payload to send url
 * @param {object} [options.headers] - The headers for the request
 * @param {number} [options.timeout] - The timeout for the request (default 30s)
 * @returns {object} The serialized HTTP response
 * @throws {FatalError}
 */
export const sendHttpRequest = async ( { url, method, payload = undefined, headers = undefined, timeout = 30_000 } ) => {
  const args = {
    method,
    headers: new Headers( headers ?? {} ),
    signal: AbortSignal.timeout( timeout )
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

  return serializeFetchResponse( response );
};

setMetadata( sendHttpRequest, { type: ComponentType.INTERNAL_STEP } );

/**
 * Invokes a trace method that resolves all trace output paths based on the executionContext
 *
 * @param {object} executionContext
 * @returns {object} Information about enabled destinations
 */
export const getTraceDestinations = executionContext => getDestinations( executionContext );

setMetadata( getTraceDestinations, { type: ComponentType.INTERNAL_STEP } );
