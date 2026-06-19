import { createChildLogger } from './index.js';

const log = createChildLogger( 'Step' );

/**
 * Step logger — a drop-in for `console.*` inside steps. The current workflow
 * execution context (workflowId, runId, activityId, activityType, workflowType)
 * is attached automatically by the root logger's context format.
 */
export const logger = {
  info: ( message, meta ) => log.info( message, meta ),
  warn: ( message, meta ) => log.warn( message, meta ),
  error: ( message, meta ) => log.error( message, meta ),
  debug: ( message, meta ) => log.debug( message, meta ),
  log: ( message, meta ) => log.info( message, meta )
};
