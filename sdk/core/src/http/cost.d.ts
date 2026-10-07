import type { KyResponse } from 'ky';

/**
 * Attach cost information to the trace of an HTTP Request using the response
 *
 * @param response - The response of the HTTP Request to attach the information
 * @param value - The price of the HTTP request
 */
export declare function addRequestCost( response: KyResponse | Response, value: number ): void;
