/**
 * Create a trace ID from the X-Request-ID header
 *
 * Returns the X-Request-ID header value if present, otherwise returns null.
 * When null is returned, tracing should be skipped entirely.
 *
 * The X-Request-ID header is assigned by the assignRequestId hook,
 * ensuring each request invocation has a unique identifier for tracing.
 *
 * @param {Request} request - The fetch API request object
 * @returns {string | null} The X-Request-ID value or null if not present
 */
export default function createTraceId( request: Request ): string | null {
  const requestId = request.headers?.get( 'X-Request-ID' );

  if ( !requestId ) {
    console.warn(
      'createTraceId: X-Request-ID header not found. Tracing will be skipped for this request.'
    );
    return null;
  }

  return requestId;
}
