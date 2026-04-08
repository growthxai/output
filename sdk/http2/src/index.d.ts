import type { RequestInfo, RequestInit, Response } from 'undici';

/**
 * Undici `fetch` with tracing: assigns `x-request-id`, logs the request/response (and errors) via `@outputai/core`.
 */
export declare function fetch( input: RequestInfo, init?: RequestInit ): Promise<Response>;

/** The Undici module (`fetch`, `Request`, `Headers`, `MockAgent`, etc.). */
export declare const undici: typeof import( 'undici' );

export type { Headers, Request, RequestInfo, RequestInit, Response } from 'undici';
