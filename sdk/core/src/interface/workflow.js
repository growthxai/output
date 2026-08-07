// THIS RUNS IN THE TEMPORAL'S SANDBOX ENVIRONMENT
import { proxyActivities, inWorkflowContext, executeChild, workflowInfo, uuid4, ParentClosePolicy, upsertMemo } from '@temporalio/workflow';
import { WorkflowValidator } from './validations/index.js';
import { toUrlSafeBase64 } from '#helpers/string';
import { WorkflowContext } from '#helpers/workflow_context';
import { deepMerge } from '#helpers/object';
import { defaultOptions } from './workflow_activity_options.js';
import { createWorkflow } from '#helpers/component';
import { enforceActivityOptions } from '#helpers/activity_options';
import { FatalError } from '#errors';
import * as C from '#consts';

/**
 * Add a global dispatcher function to be used to invoke activities.
 * This will replace direct activity invocation in the user code by the webpack loader.
 *
 * Important: Keep this as a configurable global assignment (configurable=true, enumerable=true),
 * so Temporal's reusable VM can delete it when switching workflow scopes.
 */
const createGlobalDispatcher = ( { runId, workflowType, activities } ) => {
  const dispatcher = async ( activityType, ...args ) => activities[`${workflowType}#${activityType}`]( ...args );
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

  const validator = new WorkflowValidator( { name, inputSchema, outputSchema } );

  const handler = async ( input, rawInvocationOptions = {} ) => {
    const invocationOptions = validator.parseInvocationOptions( rawInvocationOptions );

    // If called outside Temporal workflow context, just execute the handler function
    if ( !inWorkflowContext() ) {
      return validator.parseOutput(
        await fn( validator.parseInput( input ), deepMerge( WorkflowContext.build(), invocationOptions?.context ) )
      );
    }

    const { workflowId, runId, memo, root } = workflowInfo();
    const isRoot = !root;

    checkGlobalContextContamination( runId );

    // If the parent workflow already installed the activity dispatcher, it means that calls to workflow() will trigger child workflows
    const isChildWorkflowCall = !!globalThis[C.INVOKE_ACTIVITY_SYMBOL];
    if ( isChildWorkflowCall ) {
      const parentClosePolicy = ParentClosePolicy[invocationOptions?.detached ? 'ABANDON' : 'TERMINATE'];
      const childWorkflowId = `${workflowId}-${toUrlSafeBase64( uuid4() )}`;
      const args = [ input, { activityOptions: invocationOptions?.activityOptions } ];
      return executeChild( name, { args, workflowId: childWorkflowId, parentClosePolicy, memo } );
    }

    // Resolve the activity options: invocation options > definition options > parent options > default options, then enforce final SDK options
    const activityOptions = enforceActivityOptions( deepMerge(
      defaultOptions.activityOptions, // default
      memo?.activityOptions, // parent options
      options?.activityOptions, // definition options
      invocationOptions.activityOptions // invocation options
    ) );

    const activities = proxyActivities( activityOptions );
    createGlobalDispatcher( { runId, workflowType: name, activities } );

    upsertMemo( {
      activityOptions, // Resolved activity options are added to memo so child workflow executions can continue the policy chain
      ...( isRoot && memo.traceInfo && {
        trace: await activities[C.ACTIVITY_GET_TRACE_DESTINATIONS]( memo.traceInfo )
      } )
    } );

    return validator.parseOutput(
      await fn( validator.parseInput( input ), WorkflowContext.build() )
    );
  };

  return createWorkflow( { name, description, inputSchema, outputSchema, options, aliases, handler } );
}
