import type { BeforeErrorHook, Input } from 'ky';
import { HTTPError } from 'ky';
import { createTraceId, redactHeaders } from '#utils/index.js';
import { Tracing } from '@outputai/core/sdk_activity_integration';

/**
 * Wraps a fetch-like function to log and rethrow errors.
 *
 * This is nessesary as ky's beforeError hook does not trace non-HTTP errors.
 * See: https://github.com/sindresorhus/ky/issues/296
 * @param fetchFn - A fetch-compatible function (input, init) => Promise<Response>
 * @returns A new function with the same signature that logs and rethrows errors.
 */
export function applyFetchErrorTracing(
  fetchFn: ( input: Input, init?: RequestInit ) => Promise<Response>
) {
  return async ( input: Input, init?: RequestInit ): Promise<Response> => {
    try {
      return await fetchFn( input, init );
    } catch ( err ) {
      const isHTTPError = err instanceof HTTPError;
      if ( !isHTTPError ) {
        const traceId = createTraceId( input as Request );

        // Skip tracing if no X-Request-ID header is present
        if ( traceId ) {
          const isAbortError = err instanceof DOMException && err.name === 'AbortError';
          const message = isAbortError ? 'Fetch aborted due to timeout or manual cancellation' : 'Unknown error occurred';
          Tracing.addEventError( {
            id: traceId,
            details: {
              error: JSON.stringify( err, null, 2 ),
              message
            }
          } );
        } else {
          console.warn( 'applyFetchErrorTracing: Skipping fetch error tracing - no X-Request-ID header' );
        }
      }
      throw err;
    }
  };
}

/**
 * Traces HTTP errors for observability using Output.ai tracing
 */
export const traceError: BeforeErrorHook = ( error: HTTPError, _state ) => {
  const traceId = createTraceId( error.request );

  // Skip tracing if no X-Request-ID header is present
  if ( traceId ) {
    Tracing.addEventError( {
      id: traceId,
      details: {
        status: error.response.status,
        statusText: error.response.statusText,
        headers: redactHeaders( Object.fromEntries( error.response.headers.entries() ) )
      }
    } );
  } else {
    console.warn( 'traceError: Skipping HTTP error tracing - no X-Request-ID header' );
  }

  return error;
};
