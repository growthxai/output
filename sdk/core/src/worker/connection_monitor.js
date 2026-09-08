import { sleepCancellable } from '#helpers/promise';
import { createChildLogger } from '#logger';
import { setTimeout as delay } from 'node:timers/promises';

const log = createChildLogger( 'Connection' );

/** Raised when the connection health check fails repeatedly. */
export class ConnectionLostError extends Error {
  name = 'ConnectionLostError';
};

const MAX_FAILURES = 3;
const CHECK_INTERVAL_MS = 60_000;
const CHECK_TIMEOUT_MS = 5_000;

/**
 * Watches the Temporal connection health.
 * Rejects with a ConnectionLostError once the connection is considered lost.
 */
export class TemporalConnectionMonitor {
  #maxFailures = MAX_FAILURES;
  #checkIntervalMs = CHECK_INTERVAL_MS;
  #checkTimeoutMs = CHECK_TIMEOUT_MS;

  #abortCtrl = new AbortController();
  #failures = 0;
  #loops = 0;
  #running = false;
  #execution = null;
  #connection = null;
  #signal = null;

  #watch = async signal => {
    while ( !signal.aborted ) {
      try {
        await Promise.race( [
          this.#connection.workflowService.getSystemInfo( {} ),
          delay( this.#checkTimeoutMs, 0, { ref: false, signal } ).then( () => {
            throw new Error( 'Connection health check timed out' );
          } )
        ] );

        if ( this.#failures > 0 ) {
          log.info( 'Recovered' );
        }
        if ( this.#loops === 0 || this.#loops % 60 === 0 ) {
          log.info( 'Healthy' );
        }
        this.#failures = 0;

      } catch ( error ) {
        // aborting will ignore warnings and not report errors
        if ( signal.aborted ) {
          return;
        }

        const failureMessage = error?.message ?? String( error );
        if ( ++this.#failures >= this.#maxFailures ) {
          log.warn( 'Connection lost', { error: failureMessage, failures: this.#failures } );
          this.#abortCtrl.abort();
          throw new ConnectionLostError( 'Connection lost', { cause: error } );
        }

        log.warn( 'Connection unhealthy', { error: failureMessage, failures: this.#failures } );
      }

      this.#loops++;
      await sleepCancellable( this.#checkIntervalMs, signal );
    }
  };

  /**
   * @param {object} options
   * @param {import('@temporalio/worker').NativeConnection} options.connection - Temporal connection
   * @param {AbortSignal} options.signal - stops watching when aborted
   * @param {object} [options.overrides] - health check tuning, mostly for tests
   */
  constructor( { connection, signal, overrides = {} } ) {
    this.#connection = connection;
    this.#signal = signal;
    if ( Number.isFinite( overrides?.maxFailures ) ) {
      this.#maxFailures = overrides.maxFailures;
    }
    if ( Number.isFinite( overrides?.checkIntervalMs ) ) {
      this.#checkIntervalMs = overrides.checkIntervalMs;
    }
    if ( Number.isFinite( overrides?.checkTimeoutMs ) ) {
      this.#checkTimeoutMs = overrides.checkTimeoutMs;
    }
  }

  /** Returns whether the monitor is watching */
  get running() {
    return this.#running;
  }

  /**
   * Starts watching the connection. Aborting the signal stops the watch.
   * @returns {Promise<void>} resolves when the watch has stopped, rejects when the connection is lost
   */
  start() {
    if ( this.#execution ) {
      return this.#execution;
    }

    const signal = AbortSignal.any( [ this.#signal, this.#abortCtrl.signal ] );

    if ( signal.aborted ) {
      return Promise.resolve();
    }

    this.#running = true;
    this.#execution = this.#watch( signal ).finally( () => {
      this.#running = false;
    } );

    return this.#execution;
  }

  /**
   * Stops watching, without reporting a connection loss.
   * @returns {Promise<void>} resolves when the watch has fully stopped, rejects when it failed
   */
  stop() {
    this.#abortCtrl.abort();
    return this.#execution ?? Promise.resolve();
  }
};
