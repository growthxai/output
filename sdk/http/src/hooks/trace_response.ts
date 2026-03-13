import type { AfterResponseHook, KyResponse, NormalizedOptions } from 'ky';
import { Tracing } from '@outputai/core/sdk_activity_integration';
import { redactHeaders, createTraceId, parseResponseBody } from '#utils/index.js';
import { config } from '#config.js';

/**
 * Traces HTTP response for observability using Output.ai tracing
 * Respects OUTPUT_TRACE_HTTP_VERBOSE environment variable for detailed logging
 */
export const traceResponse: AfterResponseHook = async ( request: Request, _options: NormalizedOptions, response: KyResponse, _state ) => {
  const traceId = createTraceId( request );

  // Skip tracing if no X-Request-ID header is present
  if ( !traceId ) {
    console.warn( 'traceResponse: Skipping response tracing - no X-Request-ID header' );
    return response;
  }

  const details: {
    status: number;
    statusText: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {
    status: response.status,
    statusText: response.statusText
  };

  if ( config.logVerbose ) {
    const responseHeaders = Object.fromEntries( response.headers.entries() );
    details.headers = redactHeaders( responseHeaders );
    details.body = await parseResponseBody( response );
  }

  Tracing.addEventEnd( { id: traceId, details } );
  return response;
};
