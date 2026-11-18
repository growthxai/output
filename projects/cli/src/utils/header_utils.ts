/**
 * Read, extract and parse the value from "Retry-After" header from Fetch's Response Headers object.
 * - If provided as string number, convert it to milliseconds.
 * - If provided as date, subtracts the current date and return the difference in milliseconds.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Retry-After}
 * @param value - The HTTP Response Headers object
 * @returns Delay in ms or or null if not parseable
 */
export function getRetryDelayFromResponse( response: { headers?: Headers } ): number | null {
  if ( !response.headers || !response.headers.has( 'retry-after' ) ) {
    return null;
  }

  const value = response.headers.get( 'retry-after' )!;
  // test if it is number
  if ( /^\d+$/.test( value ) ) {
    return Number( value ) * 1000;
  }

  // test if has letters: RFC 1123 (IMF-fixdate), RFC 850 or ANSI C asctime()
  if ( /[a-z]/i.test( value ) ) {
    const date = new Date( value );
    if ( Number.isNaN( date.valueOf() ) ) {
      return null;
    }
    const delta = date.getTime() - Date.now();
    return Math.max( delta, 0 );
  }

  return null;
}
