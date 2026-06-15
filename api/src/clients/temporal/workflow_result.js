import { extractErrorDetail, extractErrorMessage, extractFailure } from '#utils';

/**
 * A representation of a workflow execution result, including input, output, error and meta information
 *
 * @typedef {object} WorkflowResult
 * @property {string} workflowId - The workflow execution id
 * @property {WorkflowExecutionStatus} status - The workflow status
 * @property {string} runId - The specific run id for this execution
 * @property {any} input - The original workflow input
 * @property {any} output - The workflow output
 * @property {object|null} trace - Trace information
 * @property {string|null} error - Error message if failed
 * @property {object|null} errorDetails - Structured failure details if failed (message, name, retryable, activityId, cause), null otherwise
 */

/**
 * Builds a WorkflowResult object.
 *
 * @param {Object} args - Fields
 * @param {string} args.workflowId - The workflow execution id
 * @param {WorkflowExecutionStatus} args.status - The workflow status
 * @param {string} args.runId - The specific run id for this execution
 * @param {any} args.input - The original workflow input
 * @param {object} args.result - The workflow result from @outputai/core
 * @param {Error} args.error - Error
 * @returns {WorkflowResult}
 */
export const buildWorkflowResult = ( { workflowId, status, runId, input, result, error } ) =>
  ( {
    workflowId,
    runId,
    status,
    input,
    ...( result ? {
      output: result.output,
      trace: result.trace,
      aggregations: result.aggregations
    } : {
      output: null,
      trace: null,
      aggregations: null
    } ),
    ...( error ? {
      trace: extractErrorDetail( error, 'trace' ),
      aggregations: extractErrorDetail( error, 'aggregations' ),
      error: extractErrorMessage( error ),
      errorDetails: extractFailure( error )
    } : {
      error: null,
      errorDetails: null
    } )
  } );
