/**
 * Consume Fetch's HTTP Response and return a serialized version of it;
 *
 * @param {Response} response
 * @returns {object} Serialized response
 */
export const serializeFetchResponse = async response => {
  const headers = Object.fromEntries( response.headers );
  const contentType = headers['content-type'] || '';

  const body = await ( async () => {
    if ( contentType.includes( 'application/json' ) ) {
      return response.json();
    }
    if ( contentType.startsWith( 'text/' ) ) {
      return response.text();
    }
    return response.arrayBuffer().then( buf => Buffer.from( buf ).toString( 'base64' ) );
  } )();

  return {
    url: response.url,
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    headers,
    body
  };
};
/**
 * Duck-typing to detect a Node Readable (Stream) without importing anything
 *
 * @param {unknown} v
 * @returns {boolean}
 */
const isReadable = v =>
  typeof v === 'object' &&
  typeof v?.read === 'function' &&
  typeof v?.on === 'function' &&
  typeof v?.pipe === 'function' &&
  v?.readable !== false;

/**
 * Based on the type of a payload, serialized it to be send as the body of a fetch POST request and also infer its Content Type.
 *
 * Non serializable types versus Content-Type reference (for Node)
 *
 * |Type|Is self-describing)|Inferred type by fetch|Defined mime type|
 * |-|-|-|-}
 * |Blob|yes|`blob.type`||
 * |File|yes|`file.type`||
 * |FormData|yes|"multipart/form-data; boundary=..."||
 * |URLSearchParams|yes|"application/x-www-form-urlencoded;charset=UTF-8"||
 * |ArrayBuffer|no||"application/octet-stream"|
 * |TypedArray (Uint8Array,Uint16Array)||"application/octet-stream"||
 * |DataView|no||"application/octet-stream"|
 * |ReadableStream, Readable, AsyncIterator|no||Can't, because stream must be read|
 *
 * If payload is none of the above types, test it:
 * If the it is an object, serialize using JSON.stringify and set content-type to `application/json`;
 * Else, it is a JS primitive, serialize using JSON.stringify and set content-type to `text/plain`;
 *
 * This implementation is overkill for temporal workflows since the only types available there will be:
 * - URLSearchParams
 * - ArrayBuffer
 * - TypedArrays
 * - DataView
 * - asyncGenerator
 * The others are non deterministic and are not available at runtime, but this function was build to be flexible
 *
 * @see {@link https://fetch.spec.whatwg.org/#bodyinit}
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch}
 *
 * @param {unknown} payload
 * @returns {object} An object with the serialized body and inferred content-type
 */
export const serializeBodyAndInferContentType = payload => {
  const dataTypes = [ Blob, File, URLSearchParams, FormData ];

  // empty body
  if ( [ null, undefined ].includes( payload ) ) {
    return { body: undefined, contentType: undefined };
  }

  // Buffer types, covers ArrayBuffer, TypedArrays and DataView
  if ( payload instanceof ArrayBuffer || ArrayBuffer.isView( payload ) ) {
    return { body: payload, contentType: 'application/octet-stream' };
  }

  // These data types auto assigned mime types
  if ( dataTypes.some( t => payload instanceof t ) ) {
    return { body: payload, contentType: undefined };
  }

  // ReadableStream, Readable and Async Iterator mimes cant be determined without reading it
  if ( payload instanceof ReadableStream || typeof payload[Symbol.asyncIterator] === 'function' || isReadable( payload ) ) {
    return { body: payload, contentType: undefined };
  }

  if ( typeof payload === 'object' ) {
    return { body: JSON.stringify( payload ), contentType: 'application/json; charset=UTF-8' };
  }

  return { body: String( payload ), contentType: 'text/plain; charset=UTF-8' };
};
