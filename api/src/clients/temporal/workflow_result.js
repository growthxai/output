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
 * Flattens an error's .cause chain into an array, outermost first (depth-limited).
 * @param {Error} e
 * @param {number} [depth=0]
 * @returns {Error[]}
 */
const flattenErrorChain = ( e, depth = 0 ) =>
  !( e instanceof Error ) || depth >= 10 ? [] : [ e, ...flattenErrorChain( e.cause, depth + 1 ) ];

/**
 * Builds API-safe error details from a Temporal failure chain.
 * Prefers an embedded SDK-serialized error, otherwise uses the deepest error's name and message.
 * @param {Error} error - Outermost workflow error
 * @returns {object|null} Serialized error details, including the activity type when available
 */
export const serializeError = error => {
  if ( !( error instanceof Error ) ) {
    return null;
  }

  const chain = flattenErrorChain( error );
  const activityType = chain.find( e => e.activityType )?.activityType;

  const embeddedCause = chain.flatMap( e => e.details ?? [] ).find( detail => detail?.error )?.error;
  if ( embeddedCause && typeof embeddedCause === 'object' && !Array.isArray( embeddedCause ) ) {
    return { activityType, ...embeddedCause };
  }

  const rootMostError = chain.at( -1 );
  return {
    activityType,
    name: rootMostError.type || rootMostError.constructor?.name || rootMostError.name,
    message: rootMostError.message
  };
};

/**
 * Builds a WorkflowResult object.
 *
 * @param {Object} args - Fields
 * @param {string} args.workflowId - The workflow execution id
 * @param {WorkflowExecutionStatus} args.status - The workflow status
 * @param {string} args.runId - The specific run id for this execution
 * @param {any} args.input - The original workflow input
 * @param {any} [args.result] - The workflow result from @outputai/core
 * @param {object} [args.memo] - Workflow memo containing payload version and trace information
 * @param {Error} [args.error] - Error
 * @returns {WorkflowResult}
 */
export const buildWorkflowResult = ( { workflowId, status, runId, input, result, memo, error } ) => {

  // @TODO Legacy payload, must be kept until August, 26
  const isLegacy = memo?.payloadVersion !== '2';

  if ( isLegacy ) {
    return {
      workflowId,
      runId,
      status,
      input,
      ...( result ? {
        output: result.output,
        trace: result.trace
      } : {
        output: null,
        trace: null
      } ),
      ...( error ? {
        trace: extractErrorDetail( error, 'trace' ),
        error: extractErrorMessage( error ),
        errorDetails: extractFailure( error )
      } : {
        error: null,
        errorDetails: null
      } )
    };
  }

  return {
    v: '2',
    workflowId,
    runId,
    status,
    input: input ?? null,
    output: result ?? null,
    trace: memo?.trace ?? null,
    error: serializeError( error )
  };
};
