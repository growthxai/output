import { Client } from '@temporalio/client';
import { FatalError } from '#errors';
import { Context } from '../sdk/runtime/context.js';

/**
 * Step-side access to the worker's Temporal connection.
 *
 * The worker registers its NativeConnection + namespace here after connecting
 * (worker/index.js), and clears it on shutdown. Steps and evaluators run in the
 * worker's Node process, so a Client built on that connection shares the live
 * socket and inherits the worker's full connection config (TLS, API key, proxy)
 * with no extra environment parsing.
 */

const state = {
  source: null,
  client: null
};

/** @internal Called by the worker after establishing its Temporal connection. */
export const registerWorkflowClientConnection = ( { connection, namespace } ) => {
  state.source = { connection, namespace };
  state.client = null;
};

/** @internal Called by the worker on shutdown, before closing the connection. */
export const clearWorkflowClientConnection = () => {
  state.source = null;
  state.client = null;
};

/**
 * Returns a Temporal Client that shares the running worker's connection and namespace.
 *
 * Only available inside a running Output worker (steps/evaluators); throws a
 * FatalError otherwise (e.g. unit tests) so a misconfigured call never retries.
 */
export const getWorkflowClient = () => {
  if ( state.source === null ) {
    throw new FatalError(
      'getWorkflowClient() requires a running Output worker: no Temporal connection is registered. ' +
      'It is only available inside steps/evaluators executed by the worker.'
    );
  }
  state.client ??= new Client( { connection: state.source.connection, namespace: state.source.namespace } );
  return state.client;
};

/**
 * Sends a signal to the workflow run that invoked the current step/evaluator.
 *
 * The target is resolved from the activity context and pinned to the exact
 * workflowId + runId, so a retried or superseded run can never signal a newer
 * run that reuses the same workflowId.
 */
export const signalInvokingWorkflow = async ( signalName, ...args ) => {
  const ctx = Context.getActivityContext();
  if ( ctx === null ) {
    throw new FatalError( 'signalInvokingWorkflow() must be called from inside a step or evaluator running on the Output worker' );
  }
  const { workflowId, runId } = ctx.activityInfo.workflowExecution;
  const handle = getWorkflowClient().workflow.getHandle( workflowId, runId );
  await handle.signal( signalName, ...args );
};
