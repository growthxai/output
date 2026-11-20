import { Client, WorkflowNotFoundError } from '@temporalio/client';
import { WorkflowExecutionAlreadyStartedError, WorkflowIdConflictPolicy } from '@temporalio/common';
import { WORKFLOW_CATALOG } from '#consts';
import { catalogId as workflowId, taskQueue } from '../configs.js';
import { createChildLogger } from '#logger';
import { CancelableRunner } from '#helpers/cancelable_runner';
import { sleepCancellable } from '#helpers/promise';
import { serializeError } from '#helpers/error_serializer';

const log = createChildLogger( 'Catalog' );

const MAX_RETRIES = 2;
const RETRY_DELAY = 10_000;

// The default 10s is not enough for a cold worker: the workflow bundle takes 7-8s to activate,
// so the first workflow task can exceed it and get retried. Temporal caps this at 120s.
const WORKFLOW_TASK_TIMEOUT = 30_000;

/** Make sure the latest version of the catalog workflow is running. Stateful. */
export class CatalogPublisher extends CancelableRunner {
  #catalog = null;
  #catalogHash = null;
  #client = null;

  async #describe() {
    log.info( 'Checking running catalog hash against worker hash...' );

    try {
      const description = await this.#client.workflow.getHandle( workflowId ).describe();
      return description.closeTime ? null : {
        runId: description.runId,
        hash: description.memo?.hash
      };
    } catch ( error ) {
      if ( !( error instanceof WorkflowNotFoundError ) ) {
        log.warn( 'Ignoring error while describing catalog workflow', { error: serializeError( error, { dropKeys: [ 'stack' ] } ) } );
      }
      return null;
    }
  };

  async #terminate( runId ) {
    log.info( 'Terminating previous catalog workflow...' );

    try {
      const handle = await this.#client.workflow.getHandle( workflowId, runId );
      await handle.terminate( `Systematic terminating. Superseded by catalog ${this.#catalogHash}` );
    } catch ( error ) {
      if ( !( error instanceof WorkflowNotFoundError ) ) {
        log.warn( 'Ignoring error while terminating previous catalog workflow', { error: serializeError( error, { dropKeys: [ 'stack' ] } ) } );
      }
    }
  };

  async #startWorkflow() {
    log.info( 'Starting catalog workflow...' );

    try {
      await this.#client.workflow.start( WORKFLOW_CATALOG, {
        taskQueue,
        workflowId,
        workflowIdConflictPolicy: WorkflowIdConflictPolicy.FAIL,
        workflowTaskTimeout: WORKFLOW_TASK_TIMEOUT,
        args: [ this.#catalog ],
        memo: {
          workflowNames: this.#catalog.workflowNames,
          hash: this.#catalogHash
        }
      } );
      return true;
    } catch ( error ) {
      // if catalog exists and its hash is the same as the one from the worker, ignore the error
      if ( error instanceof WorkflowExecutionAlreadyStartedError ) {
        const description = await this.#describe();
        if ( description && description.hash === this.#catalogHash ) {
          return false;
        }
      }

      throw error;
    }
  }

  async #publish( signal, retries = 0 ) {
    if ( signal.aborted ) {
      return;
    }

    try {
      const description = await this.#describe();

      if ( description ) {
        if ( description.hash === this.#catalogHash ) {
          log.info( 'Current catalog workflow hash matches worker, restart skipped' );
          return;
        }
        await this.#terminate( description.runId );
      }

      const success = await this.#startWorkflow();
      log.info( success ? 'Catalog workflow started' : 'Found a catalog workflow with matching hashes, start skipped' );
    } catch ( error ) {
      if ( retries < MAX_RETRIES ) {
        log.warn( 'Error while starting catalog workflow, retrying...', { error: serializeError( error, { dropKeys: [ 'stack' ] } ) } );
        await sleepCancellable( RETRY_DELAY, signal );
        await this.#publish( signal, retries + 1 );
      } else {
        throw error;
      }
    }
  }

  /**
   * @inheritdoc
   * @param {AbortSignal} signal
   */
  async run( signal ) {
    return this.#publish( signal );
  }

  /**
   * @param {object} options
   * @param {import('@temporalio/client').Connection} options.connection
   * @param {string} options.namespace
   * @param {object} options.catalog
   * @param {string} options.catalogHash
   * @param {AbortSignal} options.signal
   */
  constructor( { connection, namespace, catalog, catalogHash, signal } ) {
    super( { signal } );
    this.#catalog = catalog;
    this.#catalogHash = catalogHash;
    this.#client = new Client( { connection, namespace } );
  }
};
