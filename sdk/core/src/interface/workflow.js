// THIS RUNS IN THE TEMPORAL'S SANDBOX ENVIRONMENT
import { proxyActivities, inWorkflowContext, executeChild, workflowInfo, uuid4, ParentClosePolicy } from '@temporalio/workflow';
import { WorkflowValidator } from './validations/index.js';
import { toUrlSafeBase64 } from '#helpers/string';
import { WorkflowContext } from '#helpers/workflow_context';
import { TraceInfo } from '#helpers/trace_info';
import { assignImmutableProperty, deepMerge } from '#helpers/object';
import { defaultOptions } from './workflow_activity_options.js';
import {
  ACTIVITY_WRAPPER_VERSION_FIELD,
  ACTIVITY_GET_TRACE_DESTINATIONS,
  METADATA_ACCESS_SYMBOL,
  SHARED_STEP_PREFIX,
  WORKFLOW_WRAPPER_VERSION_FIELD
} from '#consts';

/**
 * @temp
 * This is to keep backwards compatibility [OUT-468]
 */
const parseActivityOutput = p => Object.hasOwn( p ?? {}, ACTIVITY_WRAPPER_VERSION_FIELD ) ? p.output : p;

/**
 * @temp This is a TEMP fallback method to allow workflow child checks on replays without memo. [OUT-468]
 * This workflows for most scenarios, only does not supports recursion with the same name.
 */
const checkChildFallback = ( { workflowType, name, aliases } ) => workflowType !== name && !aliases.includes( workflowType );

/**
 * Create a new workflow and return a wrapper function around its fn handler
 */
export function workflow( { name, description, inputSchema, outputSchema, fn, options = {}, aliases = [] } ) {
  WorkflowValidator.validateDefinition( { name, description, inputSchema, outputSchema, fn, options, aliases } );

  const { disableTrace, activityOptions } = deepMerge( defaultOptions, options );
  const validator = new WorkflowValidator( { name, inputSchema, outputSchema } );

  const wrapper = async ( input, extra = {} ) => {
    validator.validateInvocationOptions( extra );

    // this returns a plain function, for example, in unit tests
    if ( !inWorkflowContext() ) {
      validator.validateInput( input );
      const output = await fn( input, deepMerge( WorkflowContext.build(), extra?.context ) );
      validator.validateOutput( output );
      return output;
    }

    const { workflowId, workflowType, memo, root } = workflowInfo();

    // if the stack already includes this workflowId, means the workflow() function was called
    // from within a running workflow, meaning it is suppose to start a child workflow
    const isChild = Array.isArray( memo.stack ) ? memo.stack.includes( workflowId ) :
      checkChildFallback( { workflowType, aliases, name } );

    if ( isChild ) {
      const result = await executeChild( name, {
        args: undefined === input ? [] : [ input ],
        workflowId: `${workflowId}-${toUrlSafeBase64( uuid4() )}`,
        parentClosePolicy: ParentClosePolicy[extra?.detached ? 'ABANDON' : 'TERMINATE'],
        memo: {
          ...memo, // Preserve memo and mix activityOptions, if provided
          ...( extra?.activityOptions && {
            activityOptions: deepMerge( memo?.activityOptions ?? {}, extra?.activityOptions )
          } )
        }
      } );
      return result.output;
    }

    const isRoot = !root;

    memo.stack = [ ...memo.stack ?? [], workflowId ];
    // Parent options have prevalence on nested calls, child will be overwritten
    memo.activityOptions = deepMerge( activityOptions, memo.activityOptions );
    // Trace info is only added in the root workflow
    if ( isRoot ) {
      memo.traceInfo = TraceInfo.build( { disableTrace } );
    }

    const steps = proxyActivities( memo.activityOptions );
    const traceDest = isRoot && parseActivityOutput( await steps[ACTIVITY_GET_TRACE_DESTINATIONS]( memo.traceInfo ) );

    try {
      validator.validateInput( input );

      // Creates an activity caller based on a prefix
      const createCaller = prefix => async ( t, ...args ) => parseActivityOutput( await steps[`${prefix}#${t}`]( ...args ) );

      // This are functions used by the AST to replace direct activity (step/evaluator) calls
      const dispatchers = {
        invokeStep: createCaller( name ),
        invokeSharedStep: createCaller( SHARED_STEP_PREFIX ),
        invokeEvaluator: createCaller( name ),
        invokeSharedEvaluator: createCaller( SHARED_STEP_PREFIX )
      };

      // The workflow function execution with "this" set with the dispatchers
      const output = await fn.call( dispatchers, input, WorkflowContext.build() );
      validator.validateOutput( output );

      return {
        [WORKFLOW_WRAPPER_VERSION_FIELD]: 1,
        output,
        ...( traceDest && { trace: { destinations: traceDest } } )
      };
    } catch ( error ) {
      if ( isRoot && traceDest ) {
        // Append the trace destinations so it is carried to interceptor
        error[METADATA_ACCESS_SYMBOL] = { trace: { destinations: traceDest } };
      }
      throw error;
    }
  };

  assignImmutableProperty( wrapper, METADATA_ACCESS_SYMBOL, { name, description, inputSchema, outputSchema, aliases } );
  return wrapper;
};
