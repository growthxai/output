import { WorkflowNotFoundError, CatalogNotAvailableError } from '../errors.js';

/**
 * Returns the catalog object from the catalog workflow
 *
 * @param {Client} client
 * @returns {object}
 * @throws {CatalogNotAvailableError}
 * @throws {Error}
 */
export const getCatalog = async ( { client, taskQueue } ) => {
  const catalogHandle = client.workflow.getHandle( taskQueue );
  try {
    return await catalogHandle.query( 'get' );
  } catch ( error ) {
    if ( error instanceof WorkflowNotFoundError ) {
      throw new CatalogNotAvailableError( 3 );
    }
    // Annotate the catalog/query context (the only place that knows it) so the error_handler can
    // surface it when it logs the failure centrally.
    error.taskQueue = taskQueue;
    error.query = 'get';
    throw error;
  }
};

/**
 * Resolves a workflow name (or alias) to the canonical workflow name via the catalog.
 *
 * @param {object} catalog - The catalog object
 * @param {string} workflowName - The workflow name or alias
 * @param {string} taskQueue - The task queue (for error messages)
 * @returns {string} The canonical workflow name
 * @throws {WorkflowNotFoundError}
 */
export const resolveWorkflowName = ( catalog, workflowName, taskQueue ) => {
  const resolved = catalog.workflows.find( w => w.name === workflowName || w.aliases?.includes( workflowName ) );
  if ( !resolved ) {
    throw new WorkflowNotFoundError( `Workflow "${workflowName}" is not available at worker "${taskQueue}"` );
  }
  return resolved.name;
};
