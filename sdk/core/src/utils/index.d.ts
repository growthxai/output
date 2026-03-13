/**
 * > [!WARNING]
 * > **Internal use only.** Not part of the public API; may change without notice.
 *
 * @packageDocumentation
 */

/**
 * Return the first immediate directory of the file invoking the code that called this function.
 *
 * Excludes `@outputai/core`, node, and other internal paths.
 */
export function resolveInvocationDir(): string;

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

/**
 * Receives an error as argument and throws it.
 *
 * @param error
 * @throws {Error}
 */
export function throws( error: Error ): void;

/**
 * Attach given value to an object with the METADATA_ACCESS_SYMBOL symbol as key.
 *
 * @param target
 * @param value
 * @returns
 */
export function setMetadata( target: object, value: object ): void;

/**
 * Read metadata previously attached via setMetadata.
 *
 * @param target - The function or object to read metadata from.
 * @returns The metadata object, or null if none is attached.
 */
export function getMetadata( target: Function ): { name: string; description?: string; type?: string } | null;

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
export function deepMerge( a: object, b: object ): object;

/**
 * Shortens a UUID to a url-safe base64-like string (custom 64-char alphabet).
 * Temporal-friendly: no Buffer or crypto; safe to use inside workflows.
 *
 * @param uuid - Standard UUID (e.g. `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).
 * @returns Short string using A–Z, a–z, 0–9, `_`, `-` (typically 21–22 chars).
 */
export function toUrlSafeBase64( uuid: string ): string;
