import { METADATA_ACCESS_SYMBOL } from '#consts';

/**
 * Node safe clone implementation that doesn't use global structuredClone()
 * @param {object} v
 * @returns {object}
 */
export const clone = v => JSON.parse( JSON.stringify( v ) );

/**
 * Detect a JS plain object.
 *
 * @param {unknown} v
 * @returns {boolean}
 */
export const isPlainObject = v =>
  typeof v === 'object' &&
    !Array.isArray( v ) &&
    v !== null &&
    [ Object.prototype, null ].includes( Object.getPrototypeOf( v ) );

/**
 * Throw given error
 * @param {Error} e
 * @throws {e}
 */
export const throws = e => {
  throw e;
};

/**
 * Add metadata "values" property to a given object
 * @param {object} target
 * @param {object} values
 * @returns
 */
export const setMetadata = ( target, values ) =>
  Object.defineProperty( target, METADATA_ACCESS_SYMBOL, { value: values, writable: false, enumerable: false, configurable: false } );

/**
 * Read metadata previously attached via setMetadata
 * @param {Function} target
 * @returns {object|null}
 */
export const getMetadata = target => target[METADATA_ACCESS_SYMBOL] ?? null;

/**
 * Returns true if string value is stringbool and true
 * @param {string} v
 * @returns
 */
export const isStringboolTrue = v => [ '1', 'true', 'on' ].includes( v );

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

/**
 * Receives an array and returns a copy of it with the elements shuffled
 *
 * @param {array} arr
 * @returns {array}
 */
export const shuffleArray = arr => arr
  .map( v => ( { v, sort: Math.random() } ) )
  .sort( ( a, b ) => a.sort - b.sort )
  .map( ( { v } ) => v );

/**
 * Creates a new object merging object "b" onto object "a" biased to "b":
 * - Object "b" will overwrite fields on object "a";
 * - Object "b" fields that don't exist on object "a" will be created;
 * - Object "a" fields that don't exist on object "b" will not be touched;
 *
 * If "b" isn't an object, a new object equal to "a" is returned
 *
 * @param {object} a - The base object
 * @param {object} b - The target object
 * @returns {object} A new object
 */
export const deepMerge = ( a, b ) => {
  if ( !isPlainObject( a ) ) {
    throw new Error( 'Parameter "a" is not an object.' );
  }
  if ( !isPlainObject( b ) ) {
    return clone( a );
  }
  return Object.entries( b ).reduce( ( obj, [ k, v ] ) =>
    Object.assign( obj, { [k]: isPlainObject( v ) && isPlainObject( a[k] ) ? deepMerge( a[k], v ) : v } )
  , clone( a ) );
};

/**
 * Shortens a UUID by re-encoding it to base62.
 *
 * This is a Temporal friendly, without crypto or Buffer.
 * @param {string} uuid
 * @returns {string}
 */
export const toUrlSafeBase64 = uuid => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  const alphabetLen = alphabet.length;
  const base = BigInt( alphabetLen );
  const hex = uuid.replace( /-/g, '' );

  const toDigits = n => n <= 0n ? [] : toDigits( n / base ).concat( alphabet[Number( n % base )] );
  return toDigits( BigInt( '0x' + hex ) ).join( '' );
};
