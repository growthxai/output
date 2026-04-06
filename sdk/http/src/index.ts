import ky from 'ky';
import type { Options as HttpClientOptions } from 'ky';
import { assignRequestId, traceRequest, traceResponse, traceError } from './hooks/index.js';

export type { Options as HttpClientOptions } from 'ky';
export { HTTPError, TimeoutError } from 'ky';

const baseHttpClient = ky.create( {
  hooks: {
    beforeRequest: [
      assignRequestId,
      traceRequest
    ],
    afterResponse: [
      traceResponse
    ],
    beforeError: [
      traceError
    ]
  }
} );

/**
 * Creates a ky client.
 *
 * This client is customized with hooks to integrate with Output.ai tracing.
 *
 * @example
 * ```ts
 * import { httpClient } from '@outputai/http';
 *
 * const client = httpClient({
 *   prefix: 'https://api.example.com',
 *   timeout: 30000,
 *   retry: { limit: 3 }
 * });
 *
 * const response = await client.get('users/1');
 * const data = await response.json();
 * ```
 *
 * @param options - The ky options to extend the base client.
 * @returns A ky instance extended with Output.ai tracing hooks.
 */
export const httpClient = ( options: HttpClientOptions = {} ) => baseHttpClient.extend( options );
