import ky from 'ky';
import type { Options } from 'ky';
import { assignRequestId, traceRequest, traceResponse, traceError } from './hooks/index.js';
import { applyFetchErrorTracing } from '#hooks/trace_error.js';

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

const applyDefaultOptions = ( userOptions: Options ) => ( parentOptions: Options ) => {
  const kyFetch = parentOptions.fetch || globalThis.fetch.bind( globalThis );
  const patchedFetch = applyFetchErrorTracing( kyFetch );
  return {
    fetch: patchedFetch,
    ...userOptions
  };
};

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
 *   prefixUrl: 'https://api.example.com',
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
export function httpClient( options: Options = {} ) {
  return baseHttpClient.extend( applyDefaultOptions( options ) );
}

export { HTTPError, TimeoutError } from 'ky';
export type { Options as HttpClientOptions } from 'ky';
