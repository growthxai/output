import { CatalogNotAvailableError, UnsupportedWorkflowError, WorkflowNotFoundError } from '../errors.js';
import { logger } from '#logger';

const getAvailableWorkflows = async ( { client, taskQueue } ) => {
  const handle = client.workflow.getHandle( taskQueue );

  try {
    const description = await handle.describe();
    return description.memo?.workflowNames ?? {};
  } catch ( error ) {
    if ( error instanceof WorkflowNotFoundError ) {
      throw new CatalogNotAvailableError( 3, taskQueue );
    }
    // Annotate the context so the error_handler can surface it when it logs the failure centrally.
    error.taskQueue = taskQueue;
    throw error;
  }
};

/**
 * Read the memo of the catalog (same name as the task queue) and return the resolved name.
 */
export const resolveWorkflowName = async ( { client, workflowName, taskQueue } ) => {
  const workflowNames = await getAvailableWorkflows( { client, taskQueue } );

  if ( !workflowNames[workflowName] ) {
    throw new UnsupportedWorkflowError( workflowName, taskQueue );
  }

  const resolvedName = workflowNames[workflowName];
  if ( workflowName !== resolvedName ) {
    logger.info( 'Workflow alias resolved', { alias: workflowName, resolvedName, taskQueue } );
  }

  return resolvedName;
};
