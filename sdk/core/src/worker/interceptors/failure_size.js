import { ApplicationFailure, defaultFailureConverter, defaultPayloadConverter } from '@temporalio/common';
import pkg from '@temporalio/proto';
import { createChildLogger } from '#logger';
import { truncateString } from '#helpers/error_serializer';

const { temporal } = pkg;
const log = createChildLogger( 'ActivityFailure' );

/*
  Temporal's default `limit.blobSize.error`. The server replaces a larger activity failure with a generic
  "Failure exceeds size limit." that drops the real error, and Temporal Cloud keeps retrying it
  for the activity's whole retry policy.
*/
export const FAILURE_SIZE_LIMIT_BYTES = 2 * 1024 * 1024;

// 0 when the failure can't be encoded here (e.g. unserializable details): the worker's own encoding reports that.
const encodedSize = failure => {
  try {
    return temporal.api.failure.v1.Failure.encode( defaultFailureConverter.errorToFailure( failure, defaultPayloadConverter ) ).finish().byteLength;
  } catch {
    return 0;
  }
};

/**
 * Returns the failure unchanged when it fits Temporal's size limit, otherwise a compact non-retryable copy.
 * An oversized failure is deterministic in practice (it carries a payload), so retrying it only repeats it.
 *
 * @param {ApplicationFailure} failure
 * @returns {ApplicationFailure}
 */
export const capFailureSize = failure => {
  const bytes = encodedSize( failure );
  if ( bytes <= FAILURE_SIZE_LIMIT_BYTES ) {
    return failure;
  }

  log.warn( 'Activity failure exceeded Temporal size limit', { type: failure.type, bytes, limitBytes: FAILURE_SIZE_LIMIT_BYTES } );
  const capped = ApplicationFailure.create( {
    type: failure.type,
    message: `${truncateString( failure.message )} [failure was ${bytes} bytes, over Temporal's ${FAILURE_SIZE_LIMIT_BYTES}-byte limit; not retried]`,
    nonRetryable: true
  } );
  capped.stack = truncateString( failure.stack ?? '' );
  return capped;
};
