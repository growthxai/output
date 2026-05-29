import { Client, WorkflowNotFoundError } from '@temporalio/client';
import { WorkflowExecutionAlreadyStartedError, WorkflowIdConflictPolicy } from '@temporalio/common';
import { WORKFLOW_CATALOG } from '#consts';
import { catalogId, taskQueue } from './configs.js';
import { createChildLogger } from '#logger';

const log = createChildLogger( 'Catalog' );

// Note, functions don't log on "WorkflowNotFound" errors,
// because they happen when the catalog is not running at all.

/**
 * Check if the currently running catalog has the same hash as the passed argument.
 * @param {import('@temporalio/client').WorkflowHandle} handle
 * @param {string} hash
 * @returns {boolean}
 */
const checkCatalogIsTheSame = async ( handle, hash ) => {
  try {
    log.info( 'Checking running catalog hash against worker hash....' );
    const runningHash = await handle.query( 'get_hash' );
    return runningHash === hash;
  } catch ( error ) {
    if ( !( error instanceof WorkflowNotFoundError ) ) {
      log.warn( 'Error retrieving catalog hash', { error } );
    }
    return false;
  }
};

/**
 * Check if the catalog workflow is running.
 * @param {import('@temporalio/client').WorkflowHandle} handle
 * @returns
 */
const checkCatalogRunning = async handle => {
  try {
    log.info( 'Checking if the catalog workflow is running....' );
    const description = await handle.describe();
    return !description.closeTime;
  } catch ( error ) {
    if ( !( error instanceof WorkflowNotFoundError ) ) {
      log.warn( 'Error describing catalog workflow', { error } );
    }
    return false;
  }
};

/**
 * Complete previous running catalog workflow.
 * @param {import('@temporalio/client').WorkflowHandle} handle
 */
const completePreviousCatalog = async handle => {
  try {
    log.info( 'Completing previous catalog workflow...' );
    await handle.executeUpdate( 'complete', { args: [] } );
  } catch ( error ) {
    if ( !( error instanceof WorkflowNotFoundError ) ) {
      log.warn( 'Error completing previous catalog workflow', { error } );
    }
  }
};

export const startCatalog = async ( { connection, namespace, catalog, catalogHash } ) => {
  const client = new Client( { connection, namespace } );
  const handle = client.workflow.getHandle( catalogId );

  if ( await checkCatalogRunning( handle ) ) {
    if ( await checkCatalogIsTheSame( handle, catalogHash ) ) {
      log.info( 'Current catalog workflow hash matches worker, restart skipped' );
      return;
    }
    await completePreviousCatalog( handle );
  }

  const startArguments = {
    taskQueue,
    workflowId: catalogId,
    workflowIdConflictPolicy: WorkflowIdConflictPolicy.FAIL,
    args: [ catalog, catalogHash ]
  };

  log.info( 'Starting catalog workflow...' );
  try {
    await client.workflow.start( WORKFLOW_CATALOG, startArguments );
  } catch ( error ) {
    // if the error was caused by the catalog existing and its hash is the same as the one from the worker, just ignore the error
    if ( error instanceof WorkflowExecutionAlreadyStartedError && await checkCatalogIsTheSame( handle, catalogHash ) ) {
      log.info( 'Ignoring start error: it failed because execution already started but catalog hash matches worker' );
    } else {
      throw error;
    }
  }

  log.info( 'Startup completed' );
};
