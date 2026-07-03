import { WorkflowNotFoundError } from '@temporalio/client';

export { WorkflowNotFoundError, WorkflowFailedError } from '@temporalio/client';

/**
 * Build a run-aware WorkflowNotFoundError carrying the structured `workflowId`. Shared by the
 * describe and history paths; the `workflowId` field keeps the error in parity with the rest of
 * the family so `errorHandler` surfaces it in the response body and structured logs.
 */
export const workflowNotFoundError = ( workflowId, runId ) => Object.assign(
  new WorkflowNotFoundError( runId ?
    `Run "${runId}" not found for workflow "${workflowId}"` :
    `Workflow "${workflowId}" not found`
  ),
  { workflowId }
);

/** Thrown when streamHistory does not yield workflow metadata as its first chunk. */
export class WorkflowStreamProtocolError extends Error {
  /** @param {string} workflowId */
  constructor( workflowId ) {
    super( `streamHistory did not yield workflow metadata as first chunk (workflowId: ${workflowId})` );
    this.workflowId = workflowId;
  }
}

/** Thrown when the catalog workflow is not available (e.g. worker not running). */
export class CatalogNotAvailableError extends Error {
  /** @param {number} retryAfter - Seconds to suggest in Retry-After header. */
  /** @param {string} taskQueue - The task queue that the catalog was searched */
  constructor( retryAfter, taskQueue ) {
    super( 'Catalog workflow is unavailable. This is likely due the worker not running or still starting. Retry in a few seconds.' );
    this.retryAfter = retryAfter;
    this.taskQueue = taskQueue;
  }
}

/** Thrown when the workflow name is not supported by the system. */
export class UnsupportedWorkflowError extends Error {
  constructor( workflowName, taskQueue ) {
    super( `Workflow ${workflowName} is not supported in the task queue ${taskQueue}.` );
    this.taskQueue = taskQueue;
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

/** Thrown when no trace is available for a workflow execution. */
export class TraceNotAvailableError extends Error {
  constructor( workflowId ) {
    super( `No trace available for workflow "${workflowId}".` );
    this.workflowId = workflowId;
  }
}

/** Thrown when a pageToken cannot be parsed by Temporal. */
export class InvalidPageTokenError extends Error {
  constructor() {
    super( 'Invalid pageToken. Use the nextPageToken value returned by the previous page.' );
  }
}
