/**
 * Runs a Temporal worker and owns its graceful drain.
 *
 * NOTE:
 * Temporal worker shutdown is a bit odd.
 * worker.run() is an async job that only resolves when calling worker.shutdown().
 * But worker.shutdown() is not async and returns nothing, so there is no way to await it.
 * All code that needs to run after shutdown needs to be after `await worker.run()`.
 */
export class WorkerRunner {
  #worker = null;
  #signal = null;
  #running = false;
  #execution = null;

  /**
   * @param {object} options
   * @param {import('@temporalio/worker').Worker} options.worker - already created Temporal worker
   * @param {AbortSignal} options.signal - drains the worker when aborted
   */
  constructor( { worker, signal } ) {
    this.#worker = worker;
    this.#signal = signal;
  }

  /** Returns whether the worker is polling */
  get running() {
    return this.#running;
  }

  /**
   * Starts polling the task queue. Aborting the signal drains the worker.
   * @returns {Promise<void>} resolves when the worker has fully stopped, rejects when it fails
   */
  start() {
    if ( this.#execution ) {
      return this.#execution;
    }
    if ( this.#signal.aborted ) {
      return Promise.resolve();
    }

    this.#signal.addEventListener( 'abort', () => this.stop(), { once: true } );

    this.#running = true;
    this.#execution = this.#worker.run().finally( () => {
      this.#running = false;
    } );

    return this.#execution;
  }

  /**
   * Triggers the graceful drain.
   * Never rejects, a failure is reported by start(), this only waits for the worker to settle.
   * @returns {Promise<void>} resolves when the worker has fully stopped
   */
  stop() {
    if ( this.#worker.getStatus().runState === 'RUNNING' ) {
      this.#worker.shutdown();
    }
    return this.#execution?.catch( () => {} ) ?? Promise.resolve();
  }
};
