import ky from 'ky';
import type { Options } from 'ky';
import { fetch as customFetch } from './fetch/index.js';

/**
 * Creates a ky client.
 *
 * This client uses a custom fetch that introduces hooks to integrate with Output.ai tracing.
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
  return ky.create( { fetch: customFetch as NonNullable<Options['fetch']>, ...options } );
}

export { HTTPError, TimeoutError } from 'ky';
export type { Options as HttpClientOptions } from 'ky';
export * from './fetch/index.js';
