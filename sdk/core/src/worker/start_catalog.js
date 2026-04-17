import { Client } from '@temporalio/client';
import { WorkflowIdConflictPolicy } from '@temporalio/common';
import { WORKFLOW_CATALOG } from '#consts';
import { catalogId, taskQueue } from './configs.js';
import { createChildLogger } from '#logger';

const log = createChildLogger( 'Catalog' );

export const startCatalog = async ( { connection, namespace, catalog } ) => {
  const client = new Client( { connection, namespace } );

  log.info( 'Starting catalog workflow...' );
  await client.workflow.start( WORKFLOW_CATALOG, {
    taskQueue,
    workflowId: catalogId,
    workflowIdConflictPolicy: WorkflowIdConflictPolicy.TERMINATE_EXISTING,
    args: [ catalog ]
  } );
};
