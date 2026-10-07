import type * as undici from 'undici';

type NodeRequestInfo = string | URL | globalThis.Request;
type NodeRequestInit = globalThis.RequestInit & Pick<undici.RequestInit, 'dispatcher'>;

type OutputFetch = {
  ( input: NodeRequestInfo, init?: NodeRequestInit ): Promise<Response>;
  ( input: undici.RequestInfo, init?: undici.RequestInit ): Promise<Response>;
};

/**
 * A fetch compliant function, that wraps undici's fetch.
 *
 * Behaves the same as any fetch function except:
 * - Sets a request header called `x-request-trace-id` with a random UUID;
 * - Sends the request, response, error and/or failure to the Trace system;
 * - Emits a `http:request` event on every call (success, error, failure).
 *
 * Node and Undici realms can't be mixed: passing a Node `Request` with an Undici `FormData` body (or vice versa) throws a `TypeError`.
 *
 * @see {@link https://fetch.spec.whatwg.org/}
 * @param input - URL string, URL object or Request object (undici's or Node's)
 * @param init - Request options
 * @returns The HTTP response
 */
export declare const outputFetch: OutputFetch;
