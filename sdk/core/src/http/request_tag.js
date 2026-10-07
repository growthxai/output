/**
 * Symbol used to store request id in the response object.
 */
export const requestIdSymbol = Symbol( 'request_id' );

/**
 * Tag a response in place with its request id so downstream code (e.g.
 * `addRequestCost`) can correlate. Stores the id under a private symbol AND
 * patches `clone()` so the tag propagates to clones — ky clones the response
 * before invoking `afterResponse` hooks, and undici headers are immutable on
 * received responses, so a symbol re-attached inside `clone()` is the only
 * path that survives.
 *
 * @param {Response} response
 * @param {string} requestId
 */
export const addRequestIdToResponse = ( response, requestId ) => {
  Object.defineProperty( response, requestIdSymbol, { value: requestId, enumerable: false, configurable: false, writable: false } );
  const originalClone = response.clone.bind( response );
  Object.defineProperty( response, 'clone', {
    value: function clone() {
      const cloned = originalClone();
      addRequestIdToResponse( cloned, requestId );
      return cloned;
    },
    enumerable: false,
    configurable: true,
    writable: true
  } );
};
