import { messageBus } from '#bus';
import { BusEventType, WORKFLOW_CATALOG } from '#consts';
import { createChildLogger } from '#logger';

const log = createChildLogger( 'Hooks' );

/**
 * Invokes an external hook handler function with a try catch around it
 *
 * @param {Function} fn
 * @param {any} args - Args to invoke the function with
 * @param {string} hookName - hookName to identify this hook function in the logs
 */
const safeInvoke = async ( fn, args, hookName ) => {
  try {
    await fn( args );
  } catch ( error ) {
    log.error( `${hookName} hook error`, { message: error.message, stack: error.stack } );
  }
};

/** Triggers on any errors: workflow, activity and runtime */
export const onError = handler => {
  messageBus.on( BusEventType.ACTIVITY_ERROR, async ( { id, name, workflowId, workflowName, error } ) =>
    safeInvoke( handler, { source: 'activity', activityId: id, activityName: name, workflowId, workflowName, error }, 'onError' ) );
  messageBus.on( BusEventType.WORKFLOW_ERROR, async ( { id, name, error } ) =>
    safeInvoke( handler, { source: 'workflow', workflowId: id, workflowName: name, error }, 'onError' ) );
  messageBus.on( BusEventType.RUNTIME_ERROR, async ( { error } ) =>
    safeInvoke( handler, { source: 'runtime', error }, 'onError' ) );
};

/** Listen to worker before start events */
export const onBeforeWorkerStart = handler => messageBus.on( BusEventType.WORKER_BEFORE_START, () =>
  safeInvoke( handler, undefined, 'onBeforeWorkerStart' ) );

/** Listen to workflow start events, excludes catalog workflow */
export const onWorkflowStart = handler => messageBus.on( BusEventType.WORKFLOW_START, ( { id, runId, name } ) =>
  WORKFLOW_CATALOG !== name ? safeInvoke( handler, { id, runId, name }, 'onWorkflowStart' ) : null );

/** Listen to workflow end events, excludes catalog workflow */
export const onWorkflowEnd = handler => messageBus.on( BusEventType.WORKFLOW_END, ( { id, runId, name, duration } ) =>
  WORKFLOW_CATALOG !== name ? safeInvoke( handler, { id, runId, name, duration }, 'onWorkflowEnd' ) : null );

/** Listen to workflow error events, excludes catalog workflow */
export const onWorkflowError = handler => messageBus.on( BusEventType.WORKFLOW_ERROR, ( { id, runId, name, duration, error } ) =>
  WORKFLOW_CATALOG !== name ? safeInvoke( handler, { id, runId, name, duration, error }, 'onWorkflowError' ) : null );

/** Generic listener for events emitted elsewhere (outside core) */
export const on = ( eventName, handler ) => messageBus.on( `external:${eventName}`, payload =>
  safeInvoke( handler, payload, eventName ) );
