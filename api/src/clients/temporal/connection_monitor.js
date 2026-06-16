import { setTimeout as delay } from 'node:timers/promises';

const ServingStatus = {
  UNKNOWN: 0,
  SERVING: 1,
  NOT_SERVING: 2,
  SERVICE_UNKNOWN: 3
};

export class ConnectionMonitor {
  #MAX_FAILURES = 3;
  #CHECK_INTERVAL_MS = 30_000;
  #CHECK_TIMEOUT_MS = 5_000;

  #connection = null;
  #failures = 0;
  #connLostCb = null;
  #heartbeatCb = null;
  #recoverCb = null;
  #unhealthyCb = null;

  #check = async () => {
    try {
      const timeout = delay( this.#CHECK_TIMEOUT_MS, 0, { ref: false } )
        .then( () => {
          throw new Error( 'Connection health check timeout' );
        } );

      const health = await Promise.race( [ this.#connection.healthService.check( {} ), timeout ] );

      if ( health.status !== ServingStatus.SERVING ) {
        throw new Error( `Connection not serving (status ${health.status})` );
      }

      if ( this.#failures > 0 ) {
        this.#recoverCb?.();
      } else {
        this.#heartbeatCb?.();
      }
      this.#failures = 0;
    } catch ( error ) {
      this.#failures++;
      if ( this.#failures >= this.#MAX_FAILURES ) {
        this.#connLostCb?.( error );
      } else {
        this.#unhealthyCb?.( { error, failures: this.#failures } );
      }
    }

    await delay( this.#CHECK_INTERVAL_MS, 0, { ref: false } );
    return this.#check();
  };

  /**
   * Creates a new connection monitor
   * @param {Connection} connection
   */
  constructor( connection ) {
    this.#connection = connection;
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
