import { mainEventBus, stepEventBus } from '#bus';
import { BusEventType } from '#consts';
import { serializeError } from '#helpers/errors';
import { createChildLogger } from '#logger';

const log = createChildLogger( 'Hooks' );

/**
 * Invokes a function within a try catch and log the error
 *
 * @param {Function} fn
 * @param {any} args - Args to invoke the function with
 * @param {string} hookName - hookName to identify this hook function in the logs
 */
const callHookCb = async ( fn, args, hookName ) => {
  try {
    await fn( args );
  } catch ( error ) {
    log.error( `${hookName} hook error`, { error: serializeError( error ) } );
  }
};

// General Life-cycle
// --------------------------------------
const onError = cb => {
  mainEventBus.on( BusEventType.ACTIVITY_ERROR, async payload =>
    callHookCb( cb, { source: 'activity', ...payload }, 'onError' ) );
  mainEventBus.on( BusEventType.WORKFLOW_ERROR, async payload =>
    callHookCb( cb, { source: 'workflow', ...payload }, 'onError' ) );
  mainEventBus.on( BusEventType.RUNTIME_ERROR, async payload =>
    callHookCb( cb, { source: 'runtime', ...payload }, 'onError' ) );
};

const onBeforeWorkerStart = cb => mainEventBus.on( BusEventType.WORKER_BEFORE_START, () => callHookCb( cb, undefined, 'onBeforeWorkerStart' ) );

// Workflow Life-cycle
// --------------------------------------
const onWorkflowStart = cb => mainEventBus.on( BusEventType.WORKFLOW_START, payload => callHookCb( cb, payload, 'onWorkflowStart' ) );
const onWorkflowEnd = cb => mainEventBus.on( BusEventType.WORKFLOW_END, payload => callHookCb( cb, payload, 'onWorkflowEnd' ) );
const onWorkflowError = cb => mainEventBus.on( BusEventType.WORKFLOW_ERROR, payload => callHookCb( cb, payload, 'onWorkflowError' ) );

// Activity Life-cycle
// --------------------------------------
const onActivityStart = cb => mainEventBus.on( BusEventType.ACTIVITY_START, fields => callHookCb( cb, fields, 'onActivityStart' ) );
const onActivityEnd = cb => mainEventBus.on( BusEventType.ACTIVITY_END, fields => callHookCb( cb, fields, 'onActivityEnd' ) );
const onActivityError = cb => mainEventBus.on( BusEventType.ACTIVITY_ERROR, fields => callHookCb( cb, fields, 'onActivityError' ) );

// Generic Events
// --------------------------------------
/** Listen to both sdk and custom events */
const on = ( eventName, cb ) => {
  stepEventBus.on( `sdk:${eventName}`, payload => callHookCb( cb, payload, eventName ) );
  stepEventBus.on( `usr:${eventName}`, payload => callHookCb( cb, payload, eventName ) );
};

/**
 * Emits a custom event
 * @param {string} eventName
 * @param {any} payload
 */
const emit = ( eventName, payload ) => stepEventBus.emit( `usr:${eventName}`, payload );

export {
  emit,
  on,
  onActivityEnd,
  onActivityError,
  onActivityStart,
  onBeforeWorkerStart,
  onError,
  onWorkflowEnd,
  onWorkflowError,
  onWorkflowStart
};
