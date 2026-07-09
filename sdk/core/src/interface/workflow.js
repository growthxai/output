// THIS RUNS IN THE TEMPORAL'S SANDBOX ENVIRONMENT
import { proxyActivities, inWorkflowContext, executeChild, workflowInfo, uuid4, ParentClosePolicy } from '@temporalio/workflow';
import { WorkflowValidator } from './validations/index.js';
import { toUrlSafeBase64 } from '#helpers/string';
import { WorkflowContext } from '#helpers/workflow_context';
import { TraceInfo } from '#helpers/trace_info';
import { deepMerge } from '#helpers/object';
import { defaultOptions } from './workflow_activity_options.js';
import { createWorkflow } from '#helpers/component';
import * as C from '#consts';

/** Create a new workflow and return a wrapper function around its fn handler */
export function workflow( { name, description, inputSchema, outputSchema, fn, options = {}, aliases = [] } ) {
  WorkflowValidator.validateDefinition( { name, description, inputSchema, outputSchema, fn, options, aliases } );

  // Disable trace can only be defined at the definition level
  const disableTrace = options.disableTrace ?? defaultOptions.disableTrace;
  const validator = new WorkflowValidator( { name, inputSchema, outputSchema } );

  return createWorkflow( {
    name,
    description,
    inputSchema,
    outputSchema,
    options,
    aliases,
    handler: async ( input, invocationOptions = {} ) => {
      validator.validateInvocationOptions( invocationOptions );

      // If called outside Temporal workflow context, just execute the handler function
      // This is important to allow for workflows to have unit tests
      if ( !inWorkflowContext() ) {
        validator.validateInput( input );
        const output = await fn( input, deepMerge( WorkflowContext.build(), invocationOptions?.context ) );
        validator.validateOutput( output );
        return output;
      }

      const { workflowId, memo, root } = workflowInfo();

      // Resolve the activity options:
      // invocation options > parent options (memo) > definition options > default options
      const activityOptions = deepMerge(
        defaultOptions.activityOptions, // default
        options?.activityOptions, // definition options
        memo.activityOptions, // parent options
        invocationOptions.activityOptions // invocation options
      );

      // If the parent workflow already installed the activity dispatcher,
      // this means that other calls to workflow() are suppose to start child workflows
      const isChildWorkflowCall = !!globalThis[C.INVOKE_ACTIVITY_SYMBOL];
      if ( isChildWorkflowCall ) {
        return executeChild( name, {
          args: undefined === input ? [] : [ input ],
          workflowId: `${workflowId}-${toUrlSafeBase64( uuid4() )}`,
          parentClosePolicy: ParentClosePolicy[invocationOptions?.detached ? 'ABANDON' : 'TERMINATE'],
          memo: { ...memo, activityOptions }
        } ).then( r => r.output );
      }

      const isRoot = !root; // Check if this is the root most workflow

      // Trace info is only added in the root and only when trace is not disabled
      if ( isRoot && !disableTrace ) {
        memo.traceInfo = TraceInfo.build();
      }
      // Set this execution activity options in memo, so the interceptor can access it to apply per-activity overrides.
      memo.activityOptions = activityOptions;

      const activities = proxyActivities( activityOptions );

      // Add a global var to be used to invoke activities. This is rewritten in the code by the webpack loader
      // Note: Keep this as a configurable global assignment so Temporal's reusable VM can delete it when switching workflow scopes.
      globalThis[C.INVOKE_ACTIVITY_SYMBOL] = async ( activityType, ...args ) =>
        activities[`${name}#${activityType}`]( ...args ).then( r => r.output );

      const traceDestinations = isRoot && {
        trace: {
          destinations: disableTrace ? {} : await activities[C.ACTIVITY_GET_TRACE_DESTINATIONS]( memo.traceInfo ).then( r => r.output ) ?? {}
        }
      };

      try {
        validator.validateInput( input );
        const output = await fn( input, WorkflowContext.build() );
        validator.validateOutput( output );

        return { [C.WORKFLOW_WRAPPER_VERSION_FIELD]: 1, output, ...traceDestinations };
      } catch ( error ) {
        if ( traceDestinations ) {
          // Append the trace destinations so it is carried to interceptor
          error[C.METADATA_ACCESS_SYMBOL] = traceDestinations;
        }
        throw error;
      }
    }
  } );
}
