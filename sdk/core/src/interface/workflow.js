// THIS RUNS IN THE TEMPORAL'S SANDBOX ENVIRONMENT
import { proxyActivities, inWorkflowContext, executeChild, workflowInfo, uuid4, ParentClosePolicy, continueAsNew } from '@temporalio/workflow';
import { validateWorkflow } from './validations/static.js';
import { validateWithSchema } from './validations/runtime.js';
import { SHARED_STEP_PREFIX, ACTIVITY_GET_TRACE_DESTINATIONS, METADATA_ACCESS_SYMBOL } from '#consts';
import { deepMerge, setMetadata, toUrlSafeBase64 } from '#utils';
import { FatalError, ValidationError } from '#errors';
import { Context } from './workflow_context.js';

const defaultOptions = {
  activityOptions: {
    startToCloseTimeout: '20m',
    heartbeatTimeout: '5m',
    retry: {
      initialInterval: '10s',
      backoffCoefficient: 2.0,
      maximumInterval: '2m',
      maximumAttempts: 3,
      nonRetryableErrorTypes: [ ValidationError.name, FatalError.name ]
    }
  },
  disableTrace: false
};

export function workflow( { name, description, inputSchema, outputSchema, fn, options = {}, aliases = [] } ) {
  validateWorkflow( { name, description, inputSchema, outputSchema, fn, options, aliases } );

  const { disableTrace, activityOptions } = deepMerge( defaultOptions, options );
  const steps = proxyActivities( activityOptions );

  /**
   * Wraps the `fn` function of the workflow
   *
   * @param {unknown} input - The input, must match the inputSchema
   * @param {object} extra - Workflow configurations (received directly only in unit tests)
   * @returns {unknown} The result, will match the outputSchema
   */
  const wrapper = async ( input, extra = {} ) => {
    // this returns a plain function, for example, in unit tests
    if ( !inWorkflowContext() ) {
      validateWithSchema( inputSchema, input, `Workflow ${name} input` );
      const context = Context.build( { workflowId: 'test-workflow', continueAsNew: async () => {}, isContinueAsNewSuggested: () => false } );
      const output = await fn( input, deepMerge( context, extra.context ) );
      validateWithSchema( outputSchema, output, `Workflow ${name} output` );
      return output;
    }

    const { workflowId, memo, startTime } = workflowInfo();

    const context = Context.build( { workflowId, continueAsNew, isContinueAsNewSuggested: () => workflowInfo().continueAsNewSuggested } );

    // Root workflows will not have the execution context yet, since it is set here.
    const isRoot = !memo.executionContext;

    /* Creates the execution context object or preserve if it already exists:
       It will always contain the information about the root workflow
       It will be used to as context for tracing (connecting events) */
    const executionContext = memo.executionContext ?? {
      workflowId,
      workflowName: name,
      disableTrace,
      startTime: startTime.getTime()
    };

    Object.assign( memo, {
      executionContext,
      activityOptions: memo.activityOptions ?? activityOptions // Also preserve the original activity options
    } );

    // Run the internal activity to retrieve the workflow trace destinations (only for root workflows, not nested)
    const traceDestinations = isRoot ? ( await steps[ACTIVITY_GET_TRACE_DESTINATIONS]( executionContext ) ) : null;
    const traceObject = { trace: { destinations: traceDestinations } };

    try {
      // validation comes after setting memo to have that info already set for interceptor even if validations fail
      validateWithSchema( inputSchema, input, `Workflow ${name} input` );

      const dispatchers = {
        invokeStep: async ( stepName, input, options ) => steps[`${name}#${stepName}`]( input, options ),
        invokeSharedStep: async ( stepName, input, options ) => steps[`${SHARED_STEP_PREFIX}#${stepName}`]( input, options ),
        invokeEvaluator: async ( evaluatorName, input, options ) => steps[`${name}#${evaluatorName}`]( input, options ),
        invokeSharedEvaluator: async ( evaluatorName, input, options ) => steps[`${SHARED_STEP_PREFIX}#${evaluatorName}`]( input, options ),

        /**
         * Start a child workflow
         *
         * @param {string} childName
         * @param {unknown} input
         * @param {object} extra
         * @param {boolean} extra.detached
         * @param {import('@temporalio/workflow').ActivityOptions} extra.options
         * @returns {Promise<unknown>}
         */
        startWorkflow: async ( childName, input, extra = {} ) =>
          executeChild( childName, {
            args: input ? [ input ] : [],
            workflowId: `${workflowId}-${toUrlSafeBase64( uuid4() )}`,
            parentClosePolicy: ParentClosePolicy[extra?.detached ? 'ABANDON' : 'TERMINATE'],
            memo: {
              executionContext,
              parentId: workflowId,
              ...( extra?.options?.activityOptions && { activityOptions: deepMerge( activityOptions, extra.options.activityOptions ) } )
            }
          } )
      };

      const output = await fn.call( dispatchers, input, context );

      validateWithSchema( outputSchema, output, `Workflow ${name} output` );

      if ( isRoot ) {
        // Append the trace info to the result of the workflow
        return { output, ...traceObject };
      }

      return output;
    } catch ( e ) {
      // Append the trace info as metadata of the error, so it can be read by the interceptor.
      if ( isRoot ) {
        e[METADATA_ACCESS_SYMBOL] = { ...( e[METADATA_ACCESS_SYMBOL] ?? {} ), ...traceObject };
      }
      throw e;
    }
  };

  setMetadata( wrapper, { name, description, inputSchema, outputSchema, aliases } );
  return wrapper;
};
