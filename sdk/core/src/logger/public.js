import { createChildLogger } from './index.js';
import { Storage } from '#async_storage';
import { serializedActivityFields } from './context_fields.js';

const log = createChildLogger( 'Step' );

/**
 * Reads the current step execution context from AsyncLocalStorage at call time
 * and returns its flat fields, or {} when there is no active context (called
 * outside a step, or in tests).
 *
 * @returns {object}
 */
const contextFields = () => {
  const ctx = Storage.load();
  return ctx?.activityInfo ? serializedActivityFields( ctx.activityInfo ) : {};
};

const emit = level => ( message, meta ) =>
  log[level]( message, { ...contextFields(), ...meta } );

/**
 * Step logger that auto-attaches the current workflow execution context
 * (workflowId, runId, activityId, activityType, workflowType) to every line.
 */
export const logger = {
  info: emit( 'info' ),
  warn: emit( 'warn' ),
  error: emit( 'error' ),
  debug: emit( 'debug' ),
  log: emit( 'info' )
};
