export { WorkflowNotFoundError, WorkflowFailedError } from '@temporalio/client';

/** Thrown when the catalog workflow is not available (e.g. worker not running). */
export class CatalogNotAvailableError extends Error {
  /** @param {number} [retryAfter] - Seconds to suggest in Retry-After header. */
  constructor( retryAfter ) {
    super( 'Catalog workflow is unavailable. This is likely due the worker not running or still starting. Retry in a few seconds.' );
    this.retryAfter = retryAfter;
  }
}

/** Thrown when workflow result is requested but execution is not complete. */
export class WorkflowNotCompletedError extends Error {
  constructor() {
    super( 'Workflow execution is not complete.' );
  }
}

/** Thrown when synchronous workflow execution exceeds timeout. */
export class WorkflowExecutionTimedOutError extends Error {
  constructor() {
    super( 'Workflow execution exceeded timeout for synchronous execution.' );
  }
}

/** Generic Trace file related error. */
class TraceFileError extends Error {
  /**
   * @param {string} message - Error message
   * @param {string} url - Trace file url
   * @param {Error} [cause] - Underlying error
   */
  constructor( message, url, cause ) {
    super( message, { cause } );
    this.url = url;
  }
}

/** Thrown when trace file fetch fails. */
export class TraceFileDownloadError extends TraceFileError {}

/** Thrown when trace file is invalid. */
export class TraceFileParseError extends TraceFileError {}

/** Thrown when a trace file URL is not a valid. */
export class InvalidTraceFileUrl extends TraceFileError {}

/** Thrown when a step name is not found in workflow history. */
export class StepNotFoundError extends Error {
  constructor( stepName ) {
    super( `Step "${stepName}" was not found in the workflow history.` );
  }
}

/** Thrown when a step exists but has not completed. */
export class StepNotCompletedError extends Error {
  constructor( stepName ) {
    super( `Step "${stepName}" has not completed. Cannot reset to an incomplete step.` );
  }
}

/** Thrown when a pageToken cannot be parsed by Temporal. */
export class InvalidPageTokenError extends Error {
  constructor() {
    super( 'Invalid pageToken. Use the nextPageToken value returned by the previous page.' );
  }
}
