import * as configs from './configs.js';
import { createChildLogger } from '#logger';

const log = createChildLogger( 'Worker' );

const {
  maxConcurrentWorkflowTaskExecutions,
  maxConcurrentActivityTaskExecutions,
  maxCachedWorkflows,
  maxConcurrentActivityTaskPolls,
  maxConcurrentWorkflowTaskPolls,
  workflowThreadPoolSize,
  shutdownForceTime,
  shutdownGraceTime,
  workerTuner
} = configs;

/**
 * Builds the concurrency, cache and shutdown options passed to `Worker.create`.
 * Unset values are omitted so @temporalio/worker applies its own defaults.
 * @returns {object} partial Temporal worker options
 */
export const buildWorkerOptions = () => {
  if ( workerTuner ) {
    log.info( 'Using worker tuner options', { ...workerTuner } );
  }
  return {
    // tuner isn't compatible with concurrent task executions configs
    ...( workerTuner ? {
      tuner: workerTuner
    } : {
      ...( maxConcurrentWorkflowTaskExecutions !== undefined && { maxConcurrentWorkflowTaskExecutions } ),
      maxConcurrentActivityTaskExecutions
    } ),
    ...( maxCachedWorkflows !== undefined && { maxCachedWorkflows } ),
    maxConcurrentActivityTaskPolls,
    maxConcurrentWorkflowTaskPolls,
    // Omitted when unset so @temporalio/worker applies its own default, which depends on reuseV8Context.
    ...( workflowThreadPoolSize !== undefined && { workflowThreadPoolSize } ),
    ...( shutdownForceTime !== undefined && { shutdownForceTime } ),
    ...( shutdownGraceTime !== undefined && { shutdownGraceTime } )
  };
};
