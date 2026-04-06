import type { BeforeErrorHook } from 'ky';
import { HTTPError } from 'ky';
import { createTraceId, redactHeaders } from '#utils/index.js';
import { Tracing } from '@outputai/core/sdk_activity_integration';

/**
 * Traces HTTP errors for observability using Output.ai tracing
 */
export const traceError: BeforeErrorHook = ( { error, request } ) => {
  const traceId = createTraceId( request );

  // Skip tracing if no X-Request-ID header is present
  if ( traceId ) {
    if ( error instanceof HTTPError ) {
      Tracing.addEventError( {
        id: traceId,
        details: {
          status: error.response.status,
          statusText: error.response.statusText,
          headers: redactHeaders( Object.fromEntries( error.response.headers.entries() ) )
        }
      } );
    } else {
      Tracing.addEventError( { id: traceId, details: error } );
    }
  } else {
    console.warn( 'traceError: Skipping fetch error tracing - no X-Request-ID header' );
  }

  return error;
};
