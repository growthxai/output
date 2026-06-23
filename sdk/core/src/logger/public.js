import { createChildLogger } from './index.js';

/**
 * Create a namespaced logger. The current workflow execution context
 * (workflowId, runId, activityId, activityType, workflowType) is attached
 * automatically by the root logger's context format when called inside an activity.
 *
 * @param {string} namespace - Label shown on each line (e.g. 'LLM Cost', 'HTTP')
 */
export const createLogger = namespace => {
  const log = createChildLogger( namespace );
  return {
    info: ( message, meta ) => log.info( message, meta ),
    warn: ( message, meta ) => log.warn( message, meta ),
    error: ( message, meta ) => log.error( message, meta ),
    debug: ( message, meta ) => log.debug( message, meta ),
    log: ( message, meta ) => log.info( message, meta )
  };
};

/**
 * Step logger — a drop-in for `console.*` inside steps, namespaced 'Step'.
 */
export const logger = createLogger( 'Step' );
