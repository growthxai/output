import { Client, WorkflowNotFoundError } from '@temporalio/client';
import { WorkflowExecutionAlreadyStartedError, WorkflowIdConflictPolicy } from '@temporalio/common';
import { WORKFLOW_CATALOG } from '#consts';
import { catalogId as workflowId, taskQueue } from '../configs.js';
import { createChildLogger } from '#logger';
import { sleepCancellable } from '#helpers/promise';
import { serializeError } from '#helpers/error_serializer';

const log = createChildLogger( 'Catalog' );

const MAX_RETRIES = 2;
const RETRY_DELAY = 10_000;

// The default 10s is not enough for a cold worker: the workflow bundle takes 7-8s to activate,
// so the first workflow task can exceed it and get retried. Temporal caps this at 120s.
const WORKFLOW_TASK_TIMEOUT = 30_000;

/** Make sure the latest version of the catalog workflow is running. Stateful. */
export class CatalogPublisher {
  #connection = null;
  #namespace = null;
  #catalog = null;
  #catalogHash = null;
  #client = null;
  #signal = null;

  #abortCtrl = new AbortController();
  #running = false;
  #execution = null;

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

  async #start() {
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

  /** Run the sequence to start the catalog */
  async #execute( signal, retries = 0 ) {
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

      const success = await this.#start();
      log.info( success ? 'Catalog workflow started' : 'Found a catalog workflow with matching hashes, start skipped' );
    } catch ( error ) {
      if ( retries < MAX_RETRIES ) {
        log.warn( 'Error while starting catalog workflow, retrying...', { error: serializeError( error, { dropKeys: [ 'stack' ] } ) } );
        await sleepCancellable( RETRY_DELAY, signal );
        await this.#execute( signal, retries + 1 );
      } else {
        throw error;
      }
    }
  }

  constructor( { connection, namespace, catalog, catalogHash, signal } ) {
    this.#connection = connection;
    this.#namespace = namespace;
    this.#catalog = catalog;
    this.#catalogHash = catalogHash;
    this.#signal = signal;
    this.#client = new Client( { connection: this.#connection, namespace: this.#namespace } );
  }

  get running() {
    return this.#running;
  }

  run() {
    if ( this.#execution ) {
      return this.#execution;
    }

    const signal = AbortSignal.any( [ this.#signal, this.#abortCtrl.signal ] );

    this.#running = true;
    this.#execution = this.#execute( signal ).finally( _ => this.#running = false );
    return this.#execution;
  }

  interrupt() {
    this.#abortCtrl.abort();
    return this.#execution ?? Promise.resolve();
  }
};
