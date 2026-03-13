import { Client, WorkflowNotFoundError } from '@temporalio/client';
import { WorkflowIdConflictPolicy } from '@temporalio/common';
import { WORKFLOW_CATALOG } from '#consts';
import { catalogId, taskQueue } from './configs.js';
import { createChildLogger } from '#logger';

const log = createChildLogger( 'Catalog' );

export const startCatalog = async ( { connection, namespace, catalog } ) => {
  const client = new Client( { connection, namespace } );
  const catalogWorkflowHandle = client.workflow.getHandle( catalogId );

  try {
    const catalogWorkflowDescription = await catalogWorkflowHandle.describe();
    if ( !catalogWorkflowDescription.closeTime ) {
      log.info( 'Completing previous catalog workflow...' );
      await catalogWorkflowHandle.executeUpdate( 'complete', { args: [] } );
    }
  } catch ( error ) {
    // When "not found", it's either a cold start or the catalog was already stopped/terminated, ignore it.
    // Otherwise, create a log and try the next operation:
    // A. If the workflow is still running, the start() will fail and throw;
    // B. If the workflow is no running, the start() will succeed, and the error was transient;
    if ( !( error instanceof WorkflowNotFoundError ) ) {
      log.warn( 'Error interacting with previous catalog workflow', { error } );
    }
  }

  log.info( 'Starting catalog workflow...' );
  await client.workflow.start( WORKFLOW_CATALOG, {
    taskQueue,
    workflowId: catalogId, // use the name of the task queue as the catalog name, ensuring uniqueness
    workflowIdConflictPolicy: WorkflowIdConflictPolicy.FAIL,
    args: [ catalog ]
  } );
};
