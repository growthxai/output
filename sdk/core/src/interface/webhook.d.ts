import type { SerializedFetchResponse } from '../utils/index.d.ts';

/**
 * Allowed HTTP methods for request helpers.
 */
export type HttpMethod = 'HEAD' | 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * Send an POST HTTP request to a URL, optionally with a payload, then wait for a webhook response.
 *
 * The "Content-Type" is inferred from the payload type and can be overridden via the `headers` argument.
 *
 * If the body is not a type natively accepted by the Fetch API, it is serialized to a string: `JSON.stringify()` for objects, or `String()` for primitives.
 *
 * When a body is sent, the payload is wrapped together with the `workflowId` and sent as:
 * @example
 * ```js
 * const finalPayload = {
 *   workflowId,
 *   payload
 * }
 * ```
 *
 * After dispatching the request, the workflow pauses and waits for a POST to `/workflow/:id/feedback` (where `:id` is the `workflowId`). When the API receives that request, its body is delivered back to the workflow and execution resumes.
 *
 * @example
 * ```js
 * const response = await sendPostRequestAndAwaitWebhook( {
 *   url: 'https://example.com/integration',
 *   payload: {
 *   }
 * } );
 *
 * assert( response, 'the value sent back via the api' );
 * ```
 *
 * @remarks
 * - Only callable from within a workflow function; do not use in steps or evaluators.
 * - Steps and evaluators are activity-based and are not designed to be paused.
 * - If used within steps or evaluators, a compilation error will be raised.
 * - Uses a Temporal Activity to dispatch the HTTP request, working around the runtime limitation for workflows.
 * - Uses a Temporal Trigger to pause the workflow.
 * - Uses a Temporal Signal to resume the workflow when the API responds.
 *
 * @param params - Parameters object
 * @param params.url - Request URL
 * @param params.payload - Request payload
 * @param params.headers - Headers for the request
 * @returns Resolves with the payload received by the webhook
 */
export declare function sendPostRequestAndAwaitWebhook( params: {
  url: string;
  payload?: object;
  headers?: Record<string, string>;
} ): Promise<unknown>;

/**
 * Send an HTTP request to a URL.
 *
 * For POST or PUT requests, an optional payload can be sent as the body.
 *
 * The "Content-Type" is inferred from the payload type and can be overridden via the `headers` argument.
 *
 * If the body is not a type natively accepted by the Fetch API, it is serialized to a string: `JSON.stringify()` for objects, or `String()` for primitives.
 *
 * @remarks
 * - Intended for use within workflow functions; do not use in steps or evaluators.
 * - Steps and evaluators are activity-based and can perform HTTP requests directly.
 * - If used within steps or evaluators, a compilation error will be raised.
 * - Uses a Temporal Activity to dispatch the HTTP request, working around the runtime limitation for workflows.
 *
 * @param params - Parameters object
 * @param params.url - Request URL
 * @param params.method - The HTTP method (default: 'GET')
 * @param params.payload - Request payload (only for POST/PUT)
 * @param params.headers - Headers for the request
 * @returns Resolves with an HTTP response serialized to a plain object
 */
export declare function sendHttpRequest( params: {
  url: string;
  method?: HttpMethod;
  payload?: object;
  headers?: Record<string, string>;
} ): Promise<SerializedFetchResponse>;
