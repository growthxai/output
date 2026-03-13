import type { BeforeRequestHook, NormalizedOptions } from 'ky';
import { Tracing } from '@outputai/core/sdk_activity_integration';
import { redactHeaders, createTraceId, parseRequestBody } from '#utils/index.js';
import { config } from '#config.js';

/**
 * Traces HTTP request for observability using Output.ai tracing
 * Respects OUTPUT_TRACE_HTTP_VERBOSE environment variable for detailed logging
 */
export const traceRequest: BeforeRequestHook = async ( request: Request, _options: NormalizedOptions, _state ) => {
  const traceId = createTraceId( request );

  // Skip tracing if no X-Request-ID header is present
  if ( !traceId ) {
    console.warn( 'traceRequest: Skipping request tracing - no X-Request-ID header' );
    return;
  }

  const details: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {
    method: request.method,
    url: request.url
  };

  if ( config.logVerbose ) {
    const headers = Object.fromEntries( request.headers.entries() );
    details.headers = redactHeaders( headers );
    details.body = await parseRequestBody( request );
  }

  Tracing.addEventStart( { id: traceId, kind: 'http', name: 'request', details } );
};
