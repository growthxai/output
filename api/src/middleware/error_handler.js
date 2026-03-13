import {
  CatalogNotAvailableError, WorkflowNotCompletedError, WorkflowNotFoundError,
  WorkflowExecutionTimedOutError, StepNotFoundError, StepNotCompletedError
} from '../clients/errors.js';
import { logger } from '#logger';
import { isProduction } from '#configs';
import { ZodError } from 'zod';

const NAMED_ERROR_STATUSES = {
  [ZodError.name]: 400,
  [WorkflowNotFoundError.name]: 404,
  [StepNotFoundError.name]: 404,
  [WorkflowExecutionTimedOutError.name]: 408,
  [StepNotCompletedError.name]: 409,
  [WorkflowNotCompletedError.name]: 424,
  [CatalogNotAvailableError.name]: 503
};

export default function errorHandler( error, req, res, _next ) {
  res.locals.error = error; // Adds the error to locals for further processing by the logger

  const response = error instanceof ZodError ?
    { error: 'ValidationError', message: 'Invalid Payload', issues: error.issues } :
    { error: error.constructor.name, message: error.message };

  // If error includes workflowId, includes it in the response
  response.workflowId = error.workflowId;

  const status = NAMED_ERROR_STATUSES[error.constructor.name] ?? error.status ?? 500;
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
