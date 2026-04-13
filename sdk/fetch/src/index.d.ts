import type { RequestInfo, RequestInit, Response } from 'undici';

/**
 * Re-exports undici.
 *
 * Custom fetch uses RequestInfo, RequestInit, Request and Response from this realm.
 */
export declare const undici: typeof import( 'undici' );

/**
 * A fetch compliant function, that wraps undici's fetch.
 *
 * Behaves the same as any fetch function except:
 * - Adds `x-request-id` header to requests with random value (over-writable)
 * - Sends the request, response, error and/or failure to trace (from @outputai/core).
 *
 * @see {@link https://fetch.spec.whatwg.org/}
 * @param input - URL string, URL object or Request object
 * @param init - Request init options
 * @returns Promise resolving to the undici `Response`.
 */
export declare function fetch( input: RequestInfo, init?: RequestInit ): Promise<Response>;

export type { Headers, Request, RequestInfo, RequestInit, Response } from 'undici';
