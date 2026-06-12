import { ApplicationFailure } from '@temporalio/common';

/**
 * Builds a Temporal ApplicationFailure based on an error attaching info to its details
 * @param {Error} error
 * @param {unknown} info
 * @returns {ApplicationFailure}
 */
export const buildApplicationFailureWithDetails = ( error, info ) =>
  ApplicationFailure.create( {
    message: error.message,
    type: error.type ?? error.constructor?.name ?? error.name,
    nonRetryable: error.nonRetryable,
    details: ( Array.isArray( error.details ) ? error.details : [] ).concat( info ),
    cause: error
  } );
