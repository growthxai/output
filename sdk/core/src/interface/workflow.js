// THIS RUNS IN THE TEMPORAL'S SANDBOX ENVIRONMENT
import { proxyActivities, inWorkflowContext, executeChild, workflowInfo, uuid4, ParentClosePolicy } from '@temporalio/workflow';
import { WorkflowValidator } from './validations/index.js';
import { toUrlSafeBase64 } from '#helpers/string';
import { WorkflowContext } from '#helpers/workflow_context';
import { TraceInfo } from '#helpers/trace_info';
import { deepMerge } from '#helpers/object';
import { defaultOptions } from './workflow_activity_options.js';
import { createWorkflow } from '#helpers/component';
import { FatalError } from '#errors';
import * as C from '#consts';

/**
 * Execute the workflow without temporal, using the fn handler function.
 * This is important to allow for workflows to have unit tests
 */
const executeWithoutTemporal = async ( { input, validator, handler, contextOverrides = {} } ) => {
  validator.validateInput( input );
  const output = await handler( input, deepMerge( WorkflowContext.build(), contextOverrides ) );
  validator.validateOutput( output );
  return output;
};

/**
 * Add a global dispatcher function to be used to invoke activities.
 * This will replace direct activity invocation in the user code by the webpack loader.
 *
 * Important: Keep this as a configurable global assignment (configurable=true, enumerable=true),
 * so Temporal's reusable VM can delete it when switching workflow scopes.
 */
const createGlobalDispatcher = ( { runId, workflowType, activities } ) => {
  const dispatcher = async ( activityType, ...args ) => activities[`${workflowType}#${activityType}`]( ...args ).then( r => r.output );
  dispatcher.runId = runId;
  globalThis[C.INVOKE_ACTIVITY_SYMBOL] = dispatcher;
};

/**  Validate if the global dispatcher wasn't set by another workflow, indicating global context contamination. */
const checkGlobalContextContamination = runId => {
  const globalContextRunId = globalThis?.[C.INVOKE_ACTIVITY_SYMBOL]?.runId;
  if ( globalContextRunId && globalContextRunId !== runId ) {
    throw new FatalError( 'Contamination of the workflow Node global context.' +
      ` Var "globalThis[${String( C.INVOKE_ACTIVITY_SYMBOL )}]" was set by another workflow (${globalContextRunId})` );
  }
};

/** Create a new workflow and return a wrapper function around its fn handler */
export function workflow( { name, description, inputSchema, outputSchema, fn, options = {}, aliases = [] } ) {
  WorkflowValidator.validateDefinition( { name, description, inputSchema, outputSchema, fn, options, aliases } );

  // Disable trace can only be defined at the definition level
  const disableTrace = options.disableTrace ?? defaultOptions.disableTrace;
  const validator = new WorkflowValidator( { name, inputSchema, outputSchema } );

  const handler = async ( input, invocationOptions = {} ) => {
    validator.validateInvocationOptions( invocationOptions );

    // If called outside Temporal workflow context, just execute the handler function
    if ( !inWorkflowContext() ) {
      return executeWithoutTemporal( { input, validator, handler: fn, contextOverrides: invocationOptions?.context } );
    }

    const { workflowId, runId, memo, root } = workflowInfo();

    checkGlobalContextContamination( runId );

    // If the parent workflow already installed the activity dispatcher, it means that calls to workflow() will trigger child workflows
    const isChildWorkflowCall = !!globalThis[C.INVOKE_ACTIVITY_SYMBOL];
    if ( isChildWorkflowCall ) {
      const parentClosePolicy = ParentClosePolicy[invocationOptions?.detached ? 'ABANDON' : 'TERMINATE'];
      const childWorkflowId = `${workflowId}-${toUrlSafeBase64( uuid4() )}`;
      const args = [ input, { activityOptions: invocationOptions?.activityOptions } ];
      return executeChild( name, { args, workflowId: childWorkflowId, parentClosePolicy, memo } ).then( r => r.output );
    }

    const isRoot = !root; // Check if this is the root most workflow

    // Trace info is only added in the root and only when trace is not disabled
    if ( isRoot && !disableTrace ) {
      memo.traceInfo = TraceInfo.build();
    }

    // Resolve the activity options: invocation options > definition options > parent options > default options
    const activityOptions = deepMerge(
      defaultOptions.activityOptions, // default
      memo?.parentActivityOptions, // parent options
      options?.activityOptions, // definition options
      invocationOptions.activityOptions // invocation options
    );
    // Resolved activity options are added to memo so child workflow executions can continue the policy chain.
    memo.parentActivityOptions = activityOptions;
    const activities = proxyActivities( activityOptions );

    createGlobalDispatcher( { runId, workflowType: name, activities } );

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
  };

  return createWorkflow( { name, description, inputSchema, outputSchema, options, aliases, handler } );
}
