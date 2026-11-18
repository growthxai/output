import { setTimeout as delay } from 'node:timers/promises';
import { isGrpcDeadlineError } from '@temporalio/client';

export class ConnectionMonitor {
  #MAX_FAILURES = 3;
  #CHECK_INTERVAL_MS = 60_000;
  #CHECK_TIMEOUT_MS = 5_000;

  #connection = null;
  #failures = 0;
  #connLostCb = null;
  #heartbeatCb = null;
  #recoverCb = null;
  #unhealthyCb = null;

  #wrapError( error ) {
    return isGrpcDeadlineError( error ) ? new Error( 'Connection health check timed out', { cause: error } ) : error;
  }

  #check = async () => {
    while ( true ) {
      try {
        const deadline = Date.now() + this.#CHECK_TIMEOUT_MS;
        await this.#connection.withDeadline( deadline, () => this.#connection.workflowService.getSystemInfo( {} ) );

        if ( this.#failures > 0 ) {
          this.#recoverCb?.();
        } else {
          this.#heartbeatCb?.();
        }
        this.#failures = 0;
      } catch ( error ) {
        this.#failures++;
        if ( this.#failures >= this.#MAX_FAILURES ) {
          this.#connLostCb?.( this.#wrapError( error ) );
          break;
        } else {
          this.#unhealthyCb?.( { error: this.#wrapError( error ), failures: this.#failures } );
        }
      }

      await delay( this.#CHECK_INTERVAL_MS, 0, { ref: false } );
    }
  };

  /**
   * Creates a new connection monitor
   * @param {Connection} connection
   */
  constructor( connection, overrides ) {
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

  /**
   * Register a single callback to be called when the monitor loses connection for good
   * @param {Function} fn
   */
  onConnectionLost( fn ) {
    this.#connLostCb = fn;
  };

  /**
   * Register a single callback to be called when the monitor fails
   * @param {Function} fn
   */
  onUnhealthy( fn ) {
    this.#unhealthyCb = fn;
  };

  /**
   * Register a single callback to be called on every successful connection check
   * @param {Function} fn
   */
  onHeartbeat( fn ) {
    this.#heartbeatCb = fn;
  };

  /**
   * Register a single callback to be called when connection is recovered
   * @param {Function} fn
   */
  onRecover( fn ) {
    this.#recoverCb = fn;
  };

  /**
   * Start monitoring
   */
  start() {
    return this.#check();
  };

  /**
   * Is connection currently failing
   * @returns {boolean}
   */
  get failing() {
    return this.#failures > 0;
  }
}
