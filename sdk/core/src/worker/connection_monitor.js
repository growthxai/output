import { createChildLogger } from '#logger';
import { setTimeout as delay } from 'node:timers/promises';
import { CancellablePromise } from '#utils';

const ServingStatus = {
  UNKNOWN: 0,
  SERVING: 1,
  NOT_SERVING: 2,
  SERVICE_UNKNOWN: 3
};

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

  #healthcheck = async () => this.#connection.healthService.check( {} );

  #sleep = async () => delay( this.#CHECK_INTERVAL_MS, 0, { ref: false } );

  #watch = async () => {
    try {
      const health = await Promise.race( [ this.#healthcheck(), this.#getTimeout(), this.#cancellation.promise ] );

      // cancellation won the race
      if ( this.#cancellation.completed ) {
        return true;
      }

      if ( health?.status !== ServingStatus.SERVING ) {
        throw new Error( `Connection not serving (status ${health?.status})` );
      }

      log.info( this.#failures === 0 ? 'Healthy' : 'Recovered' );
      this.#failures = 0;
    } catch ( error ) {
      // cancellation will ignore warnings and not throw errors;
      if ( this.#cancellation.completed ) {
        return true;
      }

      if ( ++this.#failures >= this.#MAX_FAILURES ) {
        log.warn( 'Connection lost', { error: error.message, failures: this.#failures } );
        this.#error = error;
        this.#connectionLostCb?.( error );
        return true;
      } else {
        log.warn( 'Connection unhealthy', { error: error.message, failures: this.#failures } );
      }
    }

    await Promise.race( [ this.#sleep(), this.#cancellation.promise ] );
    if ( this.#cancellation.completed ) {
      return true;
    }
    return this.#watch();
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
