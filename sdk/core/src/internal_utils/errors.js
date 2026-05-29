/**
 * Extract a property from the error .details.
 * If error does not have details, navigate up the .cause chain.
 *
 * @param {Error} e
 * @param {string} key
 * @returns {any} The value of the property
 */
export const extractErrorDetail = ( e, key ) =>
  e ? ( e.details?.find?.( d => d[key] )?.[key] ?? extractErrorDetail( e.cause, key ) ) : null;
