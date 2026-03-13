import { randomUUID } from 'node:crypto';
import type { BeforeRequestHook } from 'ky';

/**
 * Assigns a unique request ID to each request via X-Request-ID header
 * This ensures each request invocation has a unique identifier for tracing,
 * even if the request shape (method/url/headers) is identical
 *
 * If X-Request-ID already exists (from upstream), it's preserved for propagation
 */
export const assignRequestId: BeforeRequestHook = ( request: Request ) => {
  const existingId = request.headers.get( 'X-Request-ID' );

  if ( !existingId ) {
    const requestId = randomUUID();
    request.headers.set( 'X-Request-ID', requestId );
  }
};
