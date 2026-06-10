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
 * Walks the error chain and returns the first matching detail value.
 *
 * @param {Error} e
 * @param {string} key
 * @returns {unknown}
 */
export const extractErrorDetail = ( e, key ) =>
  e ? ( e.details?.find?.( d => d[key] )?.[key] ?? extractErrorDetail( e.cause, key ) ) : null;

/**
 * Walks the error chain (via error.cause) and returns the message from the deepest error.
 * This extracts the original step error message from Temporal's nested error wrappers.
 *
 * @param {Error} e
 * @returns {string|null}
 */
export const extractErrorMessage = ( e, depth = 20 ) => depth > 0 && e?.cause ? extractErrorMessage( e.cause, depth - 1 ) : ( e?.message ?? null );

/**
 * Duck-types a Temporal ApplicationFailure node. The worker interceptor wraps user errors as
 * ApplicationFailure( message, type = constructorName, nonRetryable, details, cause ); only that
 * node carries .type / .nonRetryable. We duck-type to keep this module free of @temporalio imports.
 *
 * @param {unknown} e
 * @returns {boolean}
 */
const isApplicationFailure = e =>
  Boolean( e ) && ( typeof e.type === 'string' || typeof e.nonRetryable === 'boolean' );

/**
 * Temporal's own failure wrappers. When one of these is itself wrapped in an ApplicationFailure, the
 * wrapper's `type` names the transport layer (e.g. "ActivityFailure"), not the user's error. We skip
 * them so we surface the original throw (e.g. "Foo"/"Error") instead of "Activity task failed".
 */
const TEMPORAL_FAILURE_TYPES = new Set( [
  'ActivityFailure', 'ChildWorkflowFailure', 'TimeoutFailure',
  'CancelledFailure', 'TerminatedFailure', 'ServerFailure', 'ApplicationFailure'
] );

/**
 * Flattens an error's .cause chain into an array, outermost first (depth-limited).
 *
 * @param {Error} e
 * @param {number} [depth=20]
 * @returns {object[]}
 */
const collectChain = ( e, depth = 20 ) =>
  !e || depth <= 0 ? [] : [ e, ...collectChain( e.cause, depth - 1 ) ];

/**
 * Recursively serializes an error's .cause chain into a sanitized, transport-safe shape for
 * client responses. Includes name/message always, and type only when present (ApplicationFailure
 * nodes). Deliberately excludes stack and details (security + payload size).
 *
 * @param {Error} e
 * @param {number} [depth=0]
 * @returns {object|null}
 */
export const serializeErrorChain = ( e, depth = 0 ) => {
  if ( !e ) {
    return null;
  }
  if ( depth > 10 ) {
    return { name: 'Error', message: 'Cause chain too deep' };
  }
  return {
    name: e.constructor?.name ?? e.name ?? 'Error',
    ...( typeof e.type === 'string' ? { type: e.type } : {} ),
    message: e.message ?? null,
    ...( e.cause ? { cause: serializeErrorChain( e.cause, depth + 1 ) } : {} )
  };
};

/**
 * @typedef {object} WorkflowFailure
 * @property {string|null} message - Friendly failure message (from the ApplicationFailure node)
 * @property {string|null} type - Error type (the original error's class name)
 * @property {boolean|null} retryable - Whether the failure was retryable; null if Temporal did not report it
 * @property {object|null} cause - Sanitized error cause chain ({ name, type?, message, cause? }); no stack
 */

/**
 * Extracts structured failure details from a Temporal workflow error chain. Returns null for falsy
 * input so callers can omit the field. The friendly message/type come from the first
 * ApplicationFailure node (skipping the WorkflowFailedError/ActivityFailure wrappers).
 *
 * @param {Error} error
 * @returns {WorkflowFailure|null}
 */
export const extractFailure = error => {
  if ( !error ) {
    return null;
  }
  const chain = collectChain( error );
  // Temporal double-wraps: WorkflowFailedError -> ApplicationFailure(type=ActivityFailure) ->
  // ActivityFailure -> ApplicationFailure(type=<user error>). Prefer the deepest ApplicationFailure
  // whose type is the user's error, so we surface the friendly message rather than the wrapper.
  const deepestFirst = chain.filter( isApplicationFailure ).reverse();
  const userFailure = deepestFirst.find( link => typeof link.type === 'string' && !TEMPORAL_FAILURE_TYPES.has( link.type ) ) ??
    deepestFirst[0] ??
    null;
  // Retryability lives on whichever link Temporal flagged (usually the activity wrapper).
  const flagged = chain.find( link => typeof link.nonRetryable === 'boolean' );
  return {
    message: userFailure?.message ?? extractErrorMessage( error ),
    type: userFailure?.type ?? error.constructor?.name ?? error.name ?? null,
    retryable: flagged ? !flagged.nonRetryable : null,
    cause: serializeErrorChain( error )
  };
};

// gRPC status integers we may surface by name in logs (subset of @grpc/grpc-js Status).
const GRPC_STATUS_NAMES = {
  3: 'INVALID_ARGUMENT',
  4: 'DEADLINE_EXCEEDED',
  5: 'NOT_FOUND',
  8: 'RESOURCE_EXHAUSTED',
  9: 'FAILED_PRECONDITION',
  13: 'INTERNAL',
  14: 'UNAVAILABLE'
};

// gRPC metadata can carry auth headers/tokens, so we log only key NAMES plus an allowlist of
// non-sensitive diagnostic values.
const SAFE_METADATA_KEYS = [ 'grpc-status-details-bin', 'content-type' ];

/**
 * Redacts a gRPC Metadata instance (or plain record) to key names plus an allowlist of safe values.
 *
 * @param {object} metadata
 * @returns {{ keys: string[] }|undefined}
 */
const redactMetadata = metadata => {
  const map = typeof metadata?.getMap === 'function' ? metadata.getMap() : metadata;
  const keys = map && typeof map === 'object' ? Object.keys( map ) : [];
  return keys.length === 0 ? undefined : {
    keys,
    ...Object.fromEntries( SAFE_METADATA_KEYS.filter( k => k in map ).map( k => [ k, String( map[k] ) ] ) )
  };
};

/**
 * Recursively serializes an error and its .cause chain into a plain object for structured logging
 * (winston meta). Captures gRPC ServiceError fields (code, codeName, details, redacted metadata)
 * when a link duck-types as a gRPC error, includes the top node's stack, and surfaces context
 * annotations (workflowId, runId, taskQueue, query). For server logs only — never sent to clients.
 *
 * @param {unknown} error
 * @param {number} [depth=0]
 * @returns {object}
 */
export const serializeTemporalError = ( error, depth = 0 ) => {
  if ( depth > 10 ) {
    return { name: 'Error', message: 'Cause chain too deep' };
  }
  if ( !error || typeof error !== 'object' ) {
    return { value: String( error ) };
  }
  const isGrpc = typeof error.details === 'string' && typeof error.metadata === 'object' && error.metadata !== null;
  return {
    name: error.constructor?.name ?? error.name ?? 'Error',
    message: error.message,
    ...( depth === 0 && error.stack ? { stack: error.stack } : {} ),
    ...( isGrpc ? {
      code: error.code,
      codeName: GRPC_STATUS_NAMES[error.code] ?? 'UNKNOWN',
      details: error.details,
      metadata: redactMetadata( error.metadata )
    } : {} ),
    ...( error.workflowId ? { workflowId: error.workflowId } : {} ),
    ...( error.runId ? { runId: error.runId } : {} ),
    ...( error.taskQueue ? { taskQueue: error.taskQueue } : {} ),
    ...( error.query ? { query: error.query } : {} ),
    ...( error.cause ? { cause: serializeTemporalError( error.cause, depth + 1 ) } : {} )
  };
};

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
