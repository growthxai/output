import {
  CatalogNotAvailableError, WorkflowNotCompletedError, WorkflowNotFoundError,
  WorkflowExecutionTimedOutError, StepNotFoundError, StepNotCompletedError,
  TraceNotAvailableError, InvalidPageTokenError
} from '../clients/errors.js';
import { isGrpcServiceError } from '@temporalio/client';
import { logger } from '#logger';
import { serializeErrorChain } from '#utils';
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
  [InvalidPageTokenError.name]: 400,
  [WorkflowNotFoundError.name]: 404,
  [StepNotFoundError.name]: 404,
  [TraceNotAvailableError.name]: 404,
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

export default function errorHandler( error, req, res, next ) {
  res.locals.error = error; // Surface the error to the access logger (morgan) on every path.

  // Response already flushed (e.g. an SSE endpoint mid-stream): we can no longer write a JSON
  // error body. Streaming endpoints own their own post-flush error handling, so reaching here
  // is unexpected — surface it through the structured logger (it would otherwise only hit
  // Express's default stderr handler and bypass alerting), then delegate to Express's default
  // handler, which aborts the connection.
  if ( res.headersSent ) {
    logger.error( `Error after response headers sent: ${error.constructor.name}: ${error.message}`, {
      requestId: req?.id,
      ...( error.workflowId && { workflowId: error.workflowId } )
    } );
    return next( error );
  }

  const response = error instanceof ZodError ?
    { error: 'ValidationError', message: 'Invalid Payload', issues: error.issues } :
    { error: error.constructor.name, message: error.message };

  // If error includes workflowId, includes it in the response
  response.workflowId = error.workflowId;

  const status = NAMED_ERROR_STATUSES[error.constructor.name] ?? grpcHttpStatus( error ) ?? error.status ?? 500;
  // Log unhandled 500s with the full nested Temporal/gRPC context (cause chain, gRPC code, redacted
  // metadata) plus any catalog/query context annotated upstream. The serialized detail and stack go
  // only to logs — the client response (built above) stays sanitized.
  if ( status === 500 ) {
    logger.error( `${error.constructor.name}: ${error.message}`, {
      requestId: req?.id,
      ...( error.workflowId && { workflowId: error.workflowId } ),
      ...( error.taskQueue && { taskQueue: error.taskQueue } ),
      ...( error.query && { query: error.query } ),
      stack: error.stack,
      cause: serializeErrorChain( error )
    } );
  }

  if ( status === 503 && error.retryAfter ) {
    res.set( {
      'Retry-After': error.retryAfter
    } );
  }

  return res.status( status ).json( response );
}
