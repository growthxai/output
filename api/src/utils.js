import { nanoid } from 'nanoid';
import { InvalidTraceFileUrl } from './clients/errors.js';

/**
 * Generates a workflow id
 *
 * @returns {string}
 */
export const buildWorkflowId = () => nanoid();

/**
 * S3 URL detection and parsing utilities
 * Supports HTTPS S3 URLs in the format: https://{bucket}.s3.amazonaws.com/{key}
 * and with optional region: https://{bucket}.s3.{region}.amazonaws.com/{key}
 */

/**
 * @typedef {Object} S3UrlComponents
 * @property {string} bucket - S3 bucket name
 * @property {string} key - S3 object key
 * @property {string} [region] - AWS region (optional)
 */

/**
 * Pattern for S3 HTTPS URLs:
 * - https://{bucket}.s3.amazonaws.com/{key}
 * - https://{bucket}.s3.{region}.amazonaws.com/{key}
 */
const S3_URL_PATTERN = /^https:\/\/([a-z0-9][a-z0-9.-]*[a-z0-9])\.s3(?:\.([a-z0-9-]+))?\.amazonaws\.com\/(.+)$/;

/**
 * Parse an S3 URL and extract bucket, key, and optional region
 * @param {string} url - S3 URL to parse
 * @returns {S3UrlComponents|null} Parsed components or null if invalid
 */
export function parseS3Url( url ) {
  if ( !S3_URL_PATTERN.test( url ) ) {
    throw new InvalidTraceFileUrl( 'Url is not a valid S3 url', url );
  }

  const [ , bucket, region, encodedKey ] = url.match( S3_URL_PATTERN );

  try {
    const key = decodeURIComponent( encodedKey );
    return { bucket, key, region };
  } catch ( error ) {
    throw new InvalidTraceFileUrl( 'Error decoding the S3 key', url, error );
  }
}

/**
 * Walks the error chain (via error.cause) and returns the first error whose details contain a "trace" object.
 * Returns undefined when the argument is falsy; otherwise the first trace found or the result of recursing on cause.
 * "trace" is added to Temporal workflow errors by Core.
 *
 * @param {Error} e
 * @returns {unknown}
 */
export const extractTraceInfo = e => e ? ( e.details?.find?.( d => d.trace )?.trace ?? extractTraceInfo( e.cause ) ) : undefined;

/**
 * Walks the error chain (via error.cause) and returns the message from the deepest error.
 * This extracts the original step error message from Temporal's nested error wrappers.
 *
 * @param {Error} e
 * @returns {string|null}
 */
export const extractErrorMessage = ( e, depth = 20 ) => depth > 0 && e?.cause ? extractErrorMessage( e.cause, depth - 1 ) : ( e?.message ?? null );

/**
 * Take up to N items from an async iterable
 * @template T
 * @param {AsyncIterable<T>} iterable - The async iterable to take from
 * @param {number} count - Maximum number of items to take
 * @returns {Promise<T[]>} Array of items
 */
export const takeFromAsyncIterable = async ( iterable, count ) => {
  const items = [];
  for await ( const item of iterable ) {
    if ( items.length >= count ) {
      break;
    }
    items.push( item );
  }
  return items;
};
