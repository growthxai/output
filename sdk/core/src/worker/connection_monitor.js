import { createChildLogger } from '#logger';
import { setTimeout as delay } from 'node:timers/promises';
import { CancellablePromise } from '#utils';

const log = createChildLogger( 'Connection' );

export class TemporalConnectionMonitor {
  #MAX_FAILURES = 3;
  #CHECK_INTERVAL_MS = 60_000;
  #CHECK_TIMEOUT_MS = 5_000;

  #cancellation = new CancellablePromise();
  #failures = 0;
  #error = null;
  #running = false;
  #watchPromise = null;
  #connection = null;
  #connectionLostCb = null;

  #getTimeout = async () => delay( this.#CHECK_TIMEOUT_MS, 0, { ref: false } ).then( () => {
    throw new Error( 'Connection health check timed out' );
  } );

  #healthcheck = async () => this.#connection.workflowService.getSystemInfo( {} );

  #sleep = async () => delay( this.#CHECK_INTERVAL_MS, 0, { ref: false } );

  #watch = async () => {
    while ( !this.#cancellation.completed ) {
      try {
        await Promise.race( [ this.#healthcheck(), this.#getTimeout(), this.#cancellation.promise ] );

        // cancellation won the race
        if ( this.#cancellation.completed ) {
          break;
        }

        log.info( this.#failures === 0 ? 'Healthy' : 'Recovered' );
        this.#failures = 0;
      } catch ( error ) {
        // cancellation will ignore warnings and not throw errors;
        if ( this.#cancellation.completed ) {
          break;
        }

        if ( ++this.#failures >= this.#MAX_FAILURES ) {
          log.warn( 'Connection lost', { error: error.message, failures: this.#failures } );
          this.#error = error;
          this.#connectionLostCb?.( error );
          this.#cancellation.complete();
          break;
        } else {
          log.warn( 'Connection unhealthy', { error: error.message, failures: this.#failures } );
        }
      }

      await Promise.race( [ this.#sleep(), this.#cancellation.promise ] );
    }
  };

  constructor( connection, overrides = {} ) {
    this.#connection = connection;
    if ( Number.isFinite( overrides?.maxFailures ) ) {
      this.#MAX_FAILURES = overrides.maxFailures;
    }
    if ( Number.isFinite( overrides?.checkIntervalMs ) ) {
      this.#CHECK_INTERVAL_MS = overrides.checkIntervalMs;
    }
    if ( Number.isFinite( overrides?.checkTimeoutMs ) ) {
      this.#CHECK_TIMEOUT_MS = overrides.checkTimeoutMs;
    }
  }

  onConnectionLost( cb ) {
    this.#connectionLostCb = cb;
  }

  get running() {
    return this.#running;
  }

  start() {
    if ( this.#watchPromise ) {
      return this.#watchPromise;
    }
    this.#running = true;
    this.#watchPromise = this.#watch().finally( () => {
      this.#running = false;
    } );
    return this.#watchPromise;
  }

  stop() {
    this.#cancellation.complete();
    return this.#watchPromise ?? Promise.resolve();
  }

  get connectionLossError() {
    return this.#error;
  }
};
