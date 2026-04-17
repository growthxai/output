import {
  CatalogNotAvailableError, WorkflowNotCompletedError, WorkflowNotFoundError,
  WorkflowExecutionTimedOutError, StepNotFoundError, StepNotCompletedError
} from '../clients/errors.js';
import { isGrpcServiceError } from '@temporalio/client';
import { logger } from '#logger';
import { isProduction } from '#configs';
import { ZodError } from 'zod';

// gRPC status codes we surface as HTTP errors. Keeps the lookup numeric so we don't
// pull @grpc/grpc-js into the API just for the Status enum.
const GRPC_STATUS = {
  INVALID_ARGUMENT: 3,
  FAILED_PRECONDITION: 9
};

const GRPC_STATUS_HTTP = {
  [GRPC_STATUS.INVALID_ARGUMENT]: 400,
  [GRPC_STATUS.FAILED_PRECONDITION]: 409
};

const NAMED_ERROR_STATUSES = {
  [ZodError.name]: 400,
  [WorkflowNotFoundError.name]: 404,
  [StepNotFoundError.name]: 404,
  [WorkflowExecutionTimedOutError.name]: 408,
  [StepNotCompletedError.name]: 409,
  [WorkflowNotCompletedError.name]: 424,
  [CatalogNotAvailableError.name]: 503
};

/** Direct HTTP status for a single error link, if it is a mappable gRPC ServiceError. */
const directGrpcHttpStatus = err =>
  ( isGrpcServiceError( err ) ? GRPC_STATUS_HTTP[err.code] : undefined );

/**
 * Resolve an HTTP status for a gRPC error surfaced by the Temporal client.
 * Walks the error's cause chain so that wrapped ServiceErrors still map correctly.
 * Returns undefined when no mapping applies.
 */
const grpcHttpStatus = err =>
  ( err ? directGrpcHttpStatus( err ) ?? grpcHttpStatus( err.cause ) : undefined );

export default function errorHandler( error, req, res, _next ) {
  res.locals.error = error; // Adds the error to locals for further processing by the logger

  const response = error instanceof ZodError ?
    { error: 'ValidationError', message: 'Invalid Payload', issues: error.issues } :
    { error: error.constructor.name, message: error.message };

  // If error includes workflowId, includes it in the response
  response.workflowId = error.workflowId;

  const status = NAMED_ERROR_STATUSES[error.constructor.name] ?? grpcHttpStatus( error ) ?? error.status ?? 500;
  if ( status === 500 ) {
    logger.error( `${error.constructor.name}: ${error.message}`, { requestId: req?.id, stack: isProduction ? undefined : error.stack } );
  }

  if ( status === 503 && error.retryAfter ) {
    res.set( {
      'Retry-After': error.retryAfter
    } );
  }

  res.status( status ).json( response );
}
