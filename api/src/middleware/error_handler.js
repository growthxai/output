import { isGrpcServiceError } from '@temporalio/client';
import { logger } from '#logger';
import { serializeErrorChain } from '#utils';
import { ZodError } from 'zod';
import {
  CatalogNotAvailableError,
  InvalidPageTokenError,
  StepNotCompletedError,
  StepNotFoundError,
  TraceNotAvailableError,
  UnsupportedWorkflowError,
  WorkflowExecutionTimedOutError,
  WorkflowNotCompletedError,
  WorkflowNotFoundError
} from '../clients/errors.js';

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
  [UnsupportedWorkflowError.name]: 424,
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

/** First gRPC ServiceError link in the error's cause chain, if any. */
const findGrpcError = err =>
  ( !err || isGrpcServiceError( err ) ? err : findGrpcError( err.cause ) );

// Temporal server rejections for search attributes. Only the attribute name (and registered type)
// is extracted: the type-mismatch message also embeds the submitted value, which is not echoed.
const SEARCH_ATTRIBUTE_REJECTIONS = [
  [ /no mapping defined for search attribute (.+)$/, ( [ , name ] ) => `search attribute ${name} is not registered on the namespace` ],
  [ /search attribute (.+?) is not defined/, ( [ , name ] ) => `search attribute ${name} is not registered on the namespace` ],
  [
    /invalid value .*?for search attribute (.+?) of type (\w+)/,
    ( [ , name, type ] ) => `search attribute ${name} value does not match its registered type ${type}`
  ],
  [ /^(.+?) attribute can't be set in SearchAttributes/, ( [ , name ] ) => `search attribute ${name} is reserved and cannot be set` ]
];

/**
 * Short, value-free diagnostic for an INVALID_ARGUMENT search-attribute rejection in the cause chain.
 * Returns null when the rejection is not about search attributes.
 */
const searchAttributeDiagnostic = err => {
  const grpcError = findGrpcError( err );
  if ( grpcError?.code !== GRPC_STATUS.INVALID_ARGUMENT || !/search ?attribute/i.test( grpcError.details ) ) {
    return null;
  }
  const [ match, format ] = SEARCH_ATTRIBUTE_REJECTIONS
    .map( ( [ pattern, fmt ] ) => [ grpcError.details.match( pattern ), fmt ] )
    .find( ( [ m ] ) => m ) ?? [];
  return match ? format( match ) : 'invalid search attributes';
};

export default function errorHandler( error, req, res, next ) {
  res.locals.error = error; // Surface the error to the HTTP access logger on every path.

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

  const saDiagnostic = searchAttributeDiagnostic( error );
  if ( saDiagnostic ) {
    response.message = `${error.message}: ${saDiagnostic}`;
  }

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
