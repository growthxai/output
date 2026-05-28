// THIS RUNS IN THE TEMPORAL'S SANDBOX ENVIRONMENT
import { proxyActivities, inWorkflowContext, executeChild, workflowInfo, uuid4, ParentClosePolicy, continueAsNew } from '@temporalio/workflow';
import { defineSignal, setHandler } from '@temporalio/workflow';
import { validateWorkflow } from './validations/static.js';
import { validateWithSchema } from './validations/runtime.js';
import {
  ACTIVITY_GET_TRACE_DESTINATIONS,
  ACTIVITY_WRAPPER_VERSION_FIELD,
  METADATA_ACCESS_SYMBOL,
  SHARED_STEP_PREFIX,
  Signal,
  WORKFLOW_WRAPPER_VERSION_FIELD
} from '#consts';
import { deepMerge, setMetadata, toUrlSafeBase64 } from '#utils';
import { FatalError, ValidationError } from '#errors';
import { Context } from './workflow_context.js';
import { aggregateAttributes, mergeAggregations } from '#internal_utils/aggregations';

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

export const extractErrorDetail = ( e, key ) =>
  e ? ( e.details?.find?.( d => d[key] )?.[key] ?? extractErrorDetail( e.cause, key ) ) : null;

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
      const context = Context.build( {
        workflowId: 'test-workflow',
        runId: 'test-run',
        continueAsNew: async () => {},
        isContinueAsNewSuggested: () => false
      } );
      const output = await fn( input, deepMerge( context, extra.context ) );
      validateWithSchema( outputSchema, output, `Workflow ${name} output` );
      return output;
    }

    const { workflowId, runId, memo, startTime } = workflowInfo();
    const context = Context.build( { workflowId, runId, continueAsNew, isContinueAsNewSuggested: () => workflowInfo().continueAsNewSuggested } );

    // Root workflows will not have the execution context yet, since it is set here.
    const isRoot = !memo.executionContext;

    /* Creates the execution context object or preserve if it already exists:
       It will always contain the information about the root workflow
       It will be used to as context for tracing (connecting events) */
    const executionContext = memo.executionContext ?? {
      workflowId,
      runId,
      workflowName: name,
      disableTrace,
      startTime: startTime.getTime()
    };

    Object.assign( memo, {
      executionContext,
      activityOptions: memo.activityOptions ?? activityOptions // Also preserve the original activity options
    } );

    // Creates the result wrapper with information about the workflow
    const workflowResult = {
      [WORKFLOW_WRAPPER_VERSION_FIELD]: 1,
      aggregations: aggregateAttributes( [] ),
      ...( isRoot && await ( async () => {
        /* Run the internal activity to retrieve the workflow trace destinations
          This only happens at the root workflow because nested share the same trace file */
        const result = await steps[ACTIVITY_GET_TRACE_DESTINATIONS]( executionContext );
        /**
         * @IMPORTANT Keep support for deprecated non-wrapped activity result to allow for Temporal replays.
         * @TODO This can be removed 30days after this release
         */
        return {
          trace: {
            destinations: isActivityResultWrapped( result ) ? result.output : result
          }
        };
      } )() )
    };

    setHandler( defineSignal( Signal.SEND_AGGREGATIONS ), a => {
      workflowResult.aggregations = mergeAggregations( workflowResult.aggregations, a );
    } );

    /**
     * @IMPORTANT Keep support for deprecated add_attribute Signal to allow for Temporal replays.
     * @TODO This can be removed 30days after this release
     */
    setHandler( defineSignal( 'add_attribute' ), attribute => {
      workflowResult.aggregations = mergeAggregations( workflowResult.aggregations, aggregateAttributes( [ attribute ] ) );
    } );

    /**
     * unwraps step result to extract "aggregations" and return plain result.
     * @param {Function} step
     * @param  {...any} args
     * @returns {any} The step "output"
     */
    const callStepFn = async ( step, ...args ) => {
      const result = await step( ...args );
      /**
       * @IMPORTANT Keep support for deprecated non-wrapped activity result to allow for Temporal replays.
       * @TODO This can be removed 30days after this release
       */
      if ( isActivityResultWrapped( result ) ) {
        const { output, aggregations } = result;
        workflowResult.aggregations = mergeAggregations( workflowResult.aggregations, aggregations );
        return output;
      }
      return result;
    };

    try {
      // validation comes after setting memo to have that info already set for interceptor even if validations fail
      validateWithSchema( inputSchema, input, `Workflow ${name} input` );

      const dispatchers = {
        invokeStep: async ( stepName, input, options ) =>
          callStepFn( steps[`${name}#${stepName}`], input, options ),
        invokeSharedStep: async ( stepName, input, options ) =>
          callStepFn( steps[`${SHARED_STEP_PREFIX}#${stepName}`], input, options ),
        invokeEvaluator: async ( evaluatorName, input, options ) =>
          callStepFn( steps[`${name}#${evaluatorName}`], input, options ),
        invokeSharedEvaluator: async ( evaluatorName, input, options ) =>
          callStepFn( steps[`${SHARED_STEP_PREFIX}#${evaluatorName}`], input, options ),

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
        startWorkflow: async ( childName, input, extra = {} ) => {
          try {
            const result = await executeChild( childName, {
              args: input ? [ input ] : [],
              workflowId: `${workflowId}-${toUrlSafeBase64( uuid4() )}`,
              parentClosePolicy: ParentClosePolicy[extra?.detached ? 'ABANDON' : 'TERMINATE'],
              memo: {
                executionContext,
                parentId: workflowId,
                ...( extra?.options?.activityOptions && { activityOptions: deepMerge( activityOptions, extra.options.activityOptions ) } )
              }
            } );
            /**
             * @IMPORTANT Keep support for deprecated ".attributes" from workflow results to allow for Temporal replays.
             * @TODO This can be removed 30days after this release
             */
            if ( result?.attributes ) {
              workflowResult.aggregations = mergeAggregations( workflowResult.aggregations, aggregateAttributes( result.attributes ) );
            }
            if ( result?.aggregations ) {
              workflowResult.aggregations = mergeAggregations( workflowResult.aggregations, result.aggregations );
            }
            return result.output;
          } catch ( error ) {
            /**
             * @IMPORTANT Keep support for deprecated ".attributes" from workflow errors to allow for Temporal replays.
             * @TODO This can be removed 30days after this release
             */
            const attributesFromError = extractErrorDetail( error, 'attributes' );
            if ( attributesFromError ) {
              workflowResult.aggregations = mergeAggregations( workflowResult.aggregations, aggregateAttributes( attributesFromError ) );
            }
            const aggregationsFromError = extractErrorDetail( error, 'aggregations' );
            if ( aggregationsFromError ) {
              workflowResult.aggregations = mergeAggregations( workflowResult.aggregations, aggregationsFromError );
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
