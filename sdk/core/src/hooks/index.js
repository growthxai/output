import { messageBus } from '#bus';
import { BusEventType, ComponentType, WORKFLOW_CATALOG } from '#consts';
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
  messageBus.on( BusEventType.ACTIVITY_ERROR, async payload =>
    safeInvoke( handler, { source: 'activity', ...payload }, 'onError' ) );
  messageBus.on( BusEventType.WORKFLOW_ERROR, async payload =>
    safeInvoke( handler, { source: 'workflow', ...payload }, 'onError' ) );
  messageBus.on( BusEventType.RUNTIME_ERROR, async payload =>
    safeInvoke( handler, { source: 'runtime', ...payload }, 'onError' ) );
};

/** Listen to worker before start events */
export const onBeforeWorkerStart = handler => messageBus.on( BusEventType.WORKER_BEFORE_START, () =>
  safeInvoke( handler, undefined, 'onBeforeWorkerStart' ) );

/** Catalog workflow events should not be emitted */
const shouldEmitWorkflowEvent = workflowDetails => WORKFLOW_CATALOG !== workflowDetails.workflowType;

/** Listen to workflow start events, excludes catalog workflow */
export const onWorkflowStart = handler => messageBus.on( BusEventType.WORKFLOW_START, ( { workflowDetails, ...eventFields } ) =>
  shouldEmitWorkflowEvent( workflowDetails ) ? safeInvoke( handler, { workflowDetails, ...eventFields }, 'onWorkflowStart' ) : null );

/** Listen to workflow end events, excludes catalog workflow */
export const onWorkflowEnd = handler => messageBus.on( BusEventType.WORKFLOW_END, ( { workflowDetails, ...eventFields } ) =>
  shouldEmitWorkflowEvent( workflowDetails ) ? safeInvoke( handler, { workflowDetails, ...eventFields }, 'onWorkflowEnd' ) : null );

/** Listen to workflow error events, excludes catalog workflow */
export const onWorkflowError = handler => messageBus.on( BusEventType.WORKFLOW_ERROR, ( { workflowDetails, ...eventFields } ) =>
  shouldEmitWorkflowEvent( workflowDetails ) ? safeInvoke( handler, { workflowDetails, ...eventFields }, 'onWorkflowError' ) : null );

/** Internal activities do not trigger hooks */
const shouldEmitActivityEvent = outputActivityKind => outputActivityKind !== ComponentType.INTERNAL_STEP;

/** Listen to workflow start events, excludes catalog workflow */
export const onActivityStart = handler => messageBus.on( BusEventType.ACTIVITY_START, ( { outputActivityKind, ...eventFields } ) =>
  shouldEmitActivityEvent( outputActivityKind ) ? safeInvoke( handler, { outputActivityKind, ...eventFields }, 'onActivityStart' ) : null );

/** Listen to workflow end events, excludes catalog workflow */
export const onActivityEnd = handler => messageBus.on( BusEventType.ACTIVITY_END, ( { outputActivityKind, ...eventFields } ) =>
  shouldEmitActivityEvent( outputActivityKind ) ? safeInvoke( handler, { outputActivityKind, ...eventFields }, 'onActivityEnd' ) : null );

/** Listen to workflow error events, excludes catalog workflow */
export const onActivityError = handler => messageBus.on( BusEventType.ACTIVITY_ERROR, ( { outputActivityKind, ...eventFields } ) =>
  shouldEmitActivityEvent( outputActivityKind ) ? safeInvoke( handler, { outputActivityKind, ...eventFields }, 'onActivityError' ) : null );

/** Generic listener for events emitted elsewhere (outside core) */
export const on = ( eventName, handler ) => messageBus.on( `external:${eventName}`, payload =>
  safeInvoke( handler, payload, eventName ) );
