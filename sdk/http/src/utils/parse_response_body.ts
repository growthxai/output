import type { KyResponse } from 'ky';

/**
 * Parses response body based on content type:
 * - application/json = object
 * - text/plain = string
 *
 * @param {KyResponse} response
 * @returns {object|string|null} The parsed response
 */
export default async function parseResponseBody( response: KyResponse ): Promise<object | string | null> {
  const cloned = response.clone();
  const contentType = response.headers.get( 'content-type' ) || '';

  const body = await cloned[contentType.includes( 'application/json' ) ? 'json' : 'text']();

  return body || null;
}
