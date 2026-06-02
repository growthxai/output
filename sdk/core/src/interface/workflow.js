// THIS RUNS IN THE TEMPORAL'S SANDBOX ENVIRONMENT
import { proxyActivities, inWorkflowContext, executeChild, workflowInfo, uuid4, ParentClosePolicy } from '@temporalio/workflow';
import { defineSignal, setHandler } from '@temporalio/workflow';
import { validateWorkflow } from './validations/static.js';
import { validateWithSchema } from './validations/runtime.js';
import { deepMerge, setMetadata, toUrlSafeBase64 } from '#utils';
import { FatalError, ValidationError } from '#errors';
import { WorkflowContext } from '#internal_utils/workflow_context';
import { aggregateAttributes, mergeAggregations } from '#internal_utils/aggregations';
import { extractErrorDetail } from '#internal_utils/errors';
import { TraceInfo } from '#internal_utils/trace_info';
import {
  ACTIVITY_GET_TRACE_DESTINATIONS,
  ACTIVITY_WRAPPER_VERSION_FIELD,
  METADATA_ACCESS_SYMBOL,
  SHARED_STEP_PREFIX,
  Signal,
  WORKFLOW_WRAPPER_VERSION_FIELD
} from '#consts';

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

/**
 * Checks if the activity result uses the internal wrapper
 */
const isActivityResultWrapped = result => result?.[ACTIVITY_WRAPPER_VERSION_FIELD] > 0;

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
      const output = await fn( input, deepMerge( WorkflowContext.build(), extra.context ) );
      validateWithSchema( outputSchema, output, `Workflow ${name} output` );
      return output;
    }

    const { workflowId, memo, root } = workflowInfo();
    const context = WorkflowContext.build();

    const isRoot = !root;

    // Creates the immutable memo that will be used by all nested workflows/activities
    // Preserves all info that already exists in the memo object, so new child workflows inherit this
    Object.assign( memo, {
      traceInfo: memo.traceInfo ?? TraceInfo.build( { disableTrace } ),
      activityOptions: memo.activityOptions ?? activityOptions
    } );

    /**
     * Run the internal activity to retrieve the workflow trace destinations
     * This only happens at the root workflow because nested share the same trace file
     * @IMPORTANT Keep support for deprecated non-wrapped activity result to allow for Temporal replays.
     * @TODO [OUT-468]
    */
    const getTraceDestinations = async () => {
      const result = await steps[ACTIVITY_GET_TRACE_DESTINATIONS]( memo.traceInfo );
      return isActivityResultWrapped( result ) ? result.output : result;
    };

    // Creates the result wrapper with information about the workflow
    const workflowResult = {
      [WORKFLOW_WRAPPER_VERSION_FIELD]: 1,
      aggregations: null,
      ...( isRoot && {
        trace: {
          destinations: await getTraceDestinations()
        }
      } )
    };

    // Combine aggregations in the workflow result aggregations, mutating it
    const mergeAggregationsInWorkflowResult = aggregations => {
      workflowResult.aggregations = mergeAggregations( workflowResult.aggregations, aggregations );
    };

    setHandler( defineSignal( Signal.SEND_AGGREGATIONS ), aggregations => {
      mergeAggregationsInWorkflowResult( aggregations );
    } );

    /**
     * @IMPORTANT Keep support for deprecated add_attribute Signal to allow for Temporal replays.
     * @TODO This can be removed 30days after this release
     */
    setHandler( defineSignal( 'add_attribute' ), attribute => {
      mergeAggregationsInWorkflowResult( aggregateAttributes( [ attribute ] ) );
    } );

    /**
     * Invoke a step and unwraps the result to extract and merge "aggregations" and return only the output.
     *
     * @IMPORTANT Keep support for deprecated non-wrapped activity result to allow for Temporal replays.
     * @TODO [OUT-468]
     * @param {Function} step
     * @param  {...any} args
     * @returns {any} The step "output"
     */
    const callStepAndUnwrapResult = async ( step, ...args ) => {
      const result = await step( ...args );
      if ( !isActivityResultWrapped( result ) ) {
        return result;
      }
      const { output, aggregations } = result;
      if ( aggregations ) {
        mergeAggregationsInWorkflowResult( aggregations );
      }
      return output;
    };

    try {
      // validation comes after setting memo to have that info already set for interceptor even if validations fail
      validateWithSchema( inputSchema, input, `Workflow ${name} input` );

      const dispatchers = {
        /* This are shortcuts to invoke activities as steps/evaluators both shared and non shared */
        invokeStep: async ( stepName, input, options ) =>
          callStepAndUnwrapResult( steps[`${name}#${stepName}`], input, options ),
        invokeSharedStep: async ( stepName, input, options ) =>
          callStepAndUnwrapResult( steps[`${SHARED_STEP_PREFIX}#${stepName}`], input, options ),
        invokeEvaluator: async ( evaluatorName, input, options ) =>
          callStepAndUnwrapResult( steps[`${name}#${evaluatorName}`], input, options ),
        invokeSharedEvaluator: async ( evaluatorName, input, options ) =>
          callStepAndUnwrapResult( steps[`${SHARED_STEP_PREFIX}#${evaluatorName}`], input, options ),

        // Start a new child workflow
        startWorkflow: async ( childName, input, extra = {} ) => {
          try {
            const result = await executeChild( childName, {
              args: undefined === input ? [] : [ input ],
              workflowId: `${workflowId}-${toUrlSafeBase64( uuid4() )}`,
              parentClosePolicy: ParentClosePolicy[extra?.detached ? 'ABANDON' : 'TERMINATE'],
              memo: {
                ...memo,
                ...( extra?.options?.activityOptions && { activityOptions: deepMerge( activityOptions, extra.options.activityOptions ) } )
              }
            } );
            /**
             * @IMPORTANT Keep support for deprecated ".attributes" from workflow results to allow for Temporal replays.
             * @TODO [OUT-468]
             */
            if ( result?.attributes ) {
              mergeAggregationsInWorkflowResult( aggregateAttributes( result.attributes ) );
            }
            if ( result?.aggregations ) {
              mergeAggregationsInWorkflowResult( result.aggregations );
            }
            return result.output;
          } catch ( error ) {
            /**
             * @IMPORTANT Keep support for deprecated ".attributes" from workflow errors to allow for Temporal replays.
             * @TODO [OUT-468]
             */
            const attributesFromError = extractErrorDetail( error, 'attributes' );
            if ( attributesFromError ) {
              mergeAggregationsInWorkflowResult( aggregateAttributes( attributesFromError ) );
            }
            const aggregationsFromError = extractErrorDetail( error, 'aggregations' );
            if ( aggregationsFromError ) {
              mergeAggregationsInWorkflowResult( aggregationsFromError );
            }
            throw error;
          }
        }
      };

      workflowResult.output = await fn.call( dispatchers, input, context );

      validateWithSchema( outputSchema, workflowResult.output, `Workflow ${name} output` );

      return workflowResult;
    } catch ( e ) {
      // Append the result as metadata of the error, so it can be read by the interceptor.
      e[METADATA_ACCESS_SYMBOL] = { ...( e[METADATA_ACCESS_SYMBOL] ?? {} ), ...workflowResult };
      throw e;
    }
  };

  setMetadata( wrapper, { name, description, inputSchema, outputSchema, aliases } );
  return wrapper;
};
