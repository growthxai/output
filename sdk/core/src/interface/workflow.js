// THIS RUNS IN THE TEMPORAL'S SANDBOX ENVIRONMENT
import { proxyActivities, inWorkflowContext, executeChild, workflowInfo, uuid4, ParentClosePolicy } from '@temporalio/workflow';
import { WorkflowValidator } from './validations/index.js';
import { toUrlSafeBase64 } from '#helpers/string';
import { WorkflowContext } from '#helpers/workflow_context';
import { TraceInfo } from '#helpers/trace_info';
import { deepMerge } from '#helpers/object';
import { defaultOptions } from './workflow_activity_options.js';
import { createWorkflow } from '#helpers/component';
import { ACTIVITY_GET_TRACE_DESTINATIONS, METADATA_ACCESS_SYMBOL, WORKFLOW_WRAPPER_VERSION_FIELD } from '#consts';

const state = { activities: null, namespace: null };

/** Invokes an activity in this workflow execution context */
export const __invokeActivity = async ( name, ...args ) =>
  state.activities[`${state.namespace}#${name}`]( ...args ).then( r => r.output );

/** Create a new workflow and return a wrapper function around its fn handler */
export function workflow( { name, description, inputSchema, outputSchema, fn, options = {}, aliases = [] } ) {
  WorkflowValidator.validateDefinition( { name, description, inputSchema, outputSchema, fn, options, aliases } );

  const { disableTrace, activityOptions } = deepMerge( defaultOptions, options );
  const validator = new WorkflowValidator( { name, inputSchema, outputSchema } );

  return createWorkflow( {
    name,
    description,
    inputSchema,
    outputSchema,
    options,
    aliases,
    handler: async ( input, extra = {} ) => {
      validator.validateInvocationOptions( extra );

      // this returns a plain function, for example, in unit tests
      if ( !inWorkflowContext() ) {
        validator.validateInput( input );
        const output = await fn( input, deepMerge( WorkflowContext.build(), extra?.context ) );
        validator.validateOutput( output );
        return output;
      }

      const { workflowId, memo, root } = workflowInfo();

      // if the stack already includes this workflowId, means the workflow() function was called
      // from within a running workflow, meaning it is suppose to start a child workflow
      const isChild = Array.isArray( memo.stack ) ? memo.stack.includes( workflowId ) : false;

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
      // Trace info is only added in the root and only when trace is not disabled
      if ( isRoot && !disableTrace ) {
        memo.traceInfo = TraceInfo.build();
      }

      state.namespace = name;
      state.activities = proxyActivities( memo.activityOptions );

      const traceDestinations = isRoot && {
        trace: {
          destinations: disableTrace ? {} : await state.activities[ACTIVITY_GET_TRACE_DESTINATIONS]( memo.traceInfo ).then( r => r.output ) ?? {}
        }
      };

      try {
        validator.validateInput( input );
        const output = await fn( input, WorkflowContext.build() );
        validator.validateOutput( output );

        return { [WORKFLOW_WRAPPER_VERSION_FIELD]: 1, output, ...traceDestinations };
      } catch ( error ) {
        if ( traceDestinations ) {
          // Append the trace destinations so it is carried to interceptor
          error[METADATA_ACCESS_SYMBOL] = traceDestinations;
        }
        throw error;
      }
    }
  } );
}
