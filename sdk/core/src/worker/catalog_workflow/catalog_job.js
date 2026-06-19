import { Client, WorkflowNotFoundError } from '@temporalio/client';
import { WorkflowExecutionAlreadyStartedError, WorkflowIdConflictPolicy } from '@temporalio/common';
import { WORKFLOW_CATALOG } from '#consts';
import { catalogId, taskQueue } from '../configs.js';
import { createChildLogger } from '#logger';
import { CancellablePromise } from '#utils';

const log = createChildLogger( 'Catalog' );

class CancellationError extends Error {};

// Note, functions don't log on "WorkflowNotFound" errors,
// because they happen when the catalog is not running at all.

/** Make sure the latest version of the catalog workflow is running. Stateful. */
export class CatalogJob {
  #cancellation = new CancellablePromise();
  #connection = null;
  #namespace = null;
  #catalog = null;
  #catalogHash = null;

  #running = false;
  #executePromise = null;
  #onErrorCb = null;
  #error = null;

  #runCancellable = promise => Promise
    .race( [ promise, this.#cancellation.promise.then( () => {
      throw new CancellationError();
    } ) ] );

  /** Check if the currently running catalog has the same hash as instance. */
  async #checkCatalogIsTheSame( handle ) {
    log.info( 'Checking running catalog hash against worker hash...' );
    return this.#runCancellable( handle.query( 'get_hash' ) ).then( h => h === this.#catalogHash ).catch( e => {
      if ( e instanceof CancellationError ) {
        throw e;
      }
      if ( !( e instanceof WorkflowNotFoundError ) ) {
        log.warn( 'Error retrieving catalog hash', { error: e } );
      }
      return false;
    } );
  };

  /**  Check if the catalog workflow is running. */
  async #checkCatalogRunning( handle ) {
    log.info( 'Checking if the catalog workflow is running...' );
    return this.#runCancellable( handle.describe() ).then( d => !d.closeTime ).catch( e => {
      if ( e instanceof CancellationError ) {
        throw e;
      }
      if ( !( e instanceof WorkflowNotFoundError ) ) {
        log.warn( 'Error describing catalog workflow', { error: e } );
      }
      return false;
    } );
  };

  /** Complete previous running catalog workflow. */
  async #completePreviousCatalog( handle ) {
    log.info( 'Completing previous catalog workflow...' );
    return this.#runCancellable( handle.executeUpdate( 'complete', { args: [] } ) ).catch( e => {
      if ( e instanceof CancellationError ) {
        throw e;
      }
      if ( !( e instanceof WorkflowNotFoundError ) ) {
        log.warn( 'Error completing previous catalog workflow', { error: e } );
      }
    } );
  };

  /** Run the sequence to start the catalog */
  async #execute() {
    const client = new Client( { connection: this.#connection, namespace: this.#namespace } );
    const handle = client.workflow.getHandle( catalogId );

    if ( await this.#checkCatalogRunning( handle ) ) {
      if ( await this.#checkCatalogIsTheSame( handle ) ) {
        log.info( 'Current catalog workflow hash matches worker, restart skipped' );
        return;
      }
      await this.#completePreviousCatalog( handle );
    }

    const startArguments = {
      taskQueue,
      workflowId: catalogId,
      workflowIdConflictPolicy: WorkflowIdConflictPolicy.FAIL,
      args: [ this.#catalog, this.#catalogHash ]
    };

    log.info( 'Starting catalog workflow...' );
    try {
      await this.#runCancellable( client.workflow.start( WORKFLOW_CATALOG, startArguments ) );
    } catch ( error ) {
      // if the error was caused by the catalog existing and its hash is the same as the one from the worker, just ignore the error
      if ( error instanceof WorkflowExecutionAlreadyStartedError && await this.#checkCatalogIsTheSame( handle ) ) {
        log.info( 'Ignoring start error: it failed because execution already started but catalog hash matches worker' );
      } else {
        throw error;
      }
    }
    log.info( 'Startup completed' );
  }

  constructor( { connection, namespace, catalog, catalogHash } ) {
    this.#connection = connection;
    this.#namespace = namespace;
    this.#catalog = catalog;
    this.#catalogHash = catalogHash;
  }

  onError( cb ) {
    this.#onErrorCb = cb;
  }

  get running() {
    return this.#running;
  }

  interrupt() {
    if ( this.#running ) {
      this.#cancellation.complete();
    }
    return this.#executePromise ?? Promise.resolve();
  }

  get error() {
    return this.#error;
  }

  async run() {
    this.#running = true;
    this.#executePromise = this.#execute()
      .catch( error => {
        if ( !( error instanceof CancellationError ) ) {
          this.#error = error;
          this.#onErrorCb?.( error );
        }
      } )
      .finally( () => {
        this.#running = false;
      } );
    return this.#executePromise;
  }
};
