/**
 * > [!WARNING]
 * > **Internal use only.** Not part of the public API; may change without notice.
 *
 * @packageDocumentation
 */

/**
 * Node safe clone implementation that doesn't use global structuredClone().
 *
 * Returns a cloned version of the object.
 *
 * Only clones static properties. Getters become static properties.
 *
 * @param object
 */
export function clone( object: object ): object;

/** Represents a {Response} serialized to plain object  */
export type SerializedFetchResponse = {
  /** The response url */
  url: string,

  /** The response status code */
  status: number,

  /** The response status text */
  statusText: string,

  /** Flag indicating if the request succeeded */
  ok: boolean,

  /** Object with response headers */
  headers: Record<string, string>,

  /** Response body, either JSON, text or arrayBuffer converter to base64 */
  body: object | string
};

/**
 * Consumes an HTTP `Response` and serializes it to a plain object.
 *
 * @param response - The response to serialize.
 * @returns SerializedFetchResponse
 */
export function serializeFetchResponse( response: Response ): SerializedFetchResponse;

export type SerializedBodyAndContentType = {
  /** The body as a string when possible; otherwise the original value */
  body: string | unknown,
  /** The inferred `Content-Type` header value, if any */
  contentType: string | undefined
};

/**
 * Serializes a payload for use as a fetch POST body and infers its `Content-Type`.
 *
 * @param body - The payload to serialize.
 * @returns The serialized body and inferred `Content-Type`.
 */
export function serializeBodyAndInferContentType( body: unknown ): SerializedBodyAndContentType;

/**
 * Returns true if the value is a plain object:
 * - `{}`
 * - `new Object()`
 * - `Object.create(null)`
 *
 * @param object - The value to check.
 * @returns Whether the value is a plain object.
 */
export function isPlainObject( object: unknown ): boolean;

/**
 * Returns a copy of an array with its content shuffled.
 *
 * @param arr - The array to shuffle
 * @returns A shuffled array copy
 */
export function shuffleArray( arr: unknown[] ): unknown[];

/**
 * Creates a new object by merging object `b` onto object `a`, biased toward `b`:
 * - Fields in `b` overwrite fields in `a`.
 * - Fields in `b` that don't exist in `a` are created.
 * - Fields in `a` that don't exist in `b` are left unchanged.
 *
 * @param a - The base object.
 * @param b - The overriding object.
 * @throws {Error} If either `a` or `b` is not a plain object.
 * @returns A new merged object.
 */
export function deepMerge( a: object, b: object | null | undefined ): object;

/**
 * Creates a new object by merging object `b` onto object `a`, biased toward `b`:
 * - Fields in `b` that don't exist in `a` are created.
 * - Fields in `a` that don't exist in `b` are left unchanged.
 * - Fields in `a` and `b` are passed as arguments to the resolve function (a,b) and its return assigns the new value.
 *
 * @param a - The base object.
 * @param b - The overriding object.
 * @param resolver - The resolver function.
 * @throws {Error} If either `a` or `b` is not a plain object.
 * @returns A new merged object.
 */
export function deepMergeWithResolver( a: object, b: object | null | undefined, resolver: function ): object;

/**
 * Shortens a UUID to a url-safe base64-like string (custom 64-char alphabet).
 * Temporal-friendly: no Buffer or crypto; safe to use inside workflows.
 *
 * @param uuid - Standard UUID (e.g. `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).
 * @returns Short string using A–Z, a–z, 0–9, `_`, `-` (typically 21–22 chars).
 */
export function toUrlSafeBase64( uuid: string ): string;

/**
 * Similar to native Promise.allSettled, but rejects with `{ isTimeout: true }`
 * if the execution exceeds the given timeout.
 *
 * @param promises - Values or promises to wait for.
 * @param timeoutMs - Maximum wait time in milliseconds.
 * @returns Native Promise.allSettled-style results.
 */
export function allSettledWithTimeout<T>(
  promises: Array<T | PromiseLike<T>>,
  timeoutMs: number
): Promise<PromiseSettledResult<Awaited<T>>[]>;

/**
 * Promise wrapper that can be resolved externally.
 */
export class CancellablePromise {
  /** The internal promise */
  readonly promise: Promise<void>;
  /** Whether the promise is already resolved or not */
  readonly completed: boolean;
  /** Resolves the promise */
  complete(): void;
}

/**
 * Returns a function that invokes the wrapped function once.
 */
export function runOnce<Args extends unknown[], Return>(
  fn: ( ...args: Args ) => Return
): ( ...args: Args ) => Return;
