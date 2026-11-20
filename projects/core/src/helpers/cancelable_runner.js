/**
 * Abortable one-shot or looping task.
 * Subclasses implement {@link CancelableRunner#run}.
 */
export class CancelableRunner {
  #abortCtrl = new AbortController();
  #running = false;
  #execution = null;
  #signal = null;

  /**
   * @param {object} options
   * @param {AbortSignal} options.signal - stops the runner when aborted
   */
  constructor( { signal } ) {
    this.#signal = signal;
  }

  /** Whether start() has an in-flight execution */
  get running() {
    return this.#running;
  }

  /**
   * Starts the runner. Idempotent: later calls return the same promise.
   * @returns {Promise<*>} settles when run() finishes; rejects if run() rejects
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
    this.#execution = this.run( signal ).finally( () => {
      this.#running = false;
    } );

    return this.#execution;
  }

  /**
   * Stops the runner and waits for the in-flight execution to settle.
   * @returns {Promise<*>}
   */
  stop() {
    this.abort();
    return this.#execution ?? Promise.resolve();
  }

  /** Abort without waiting. Safe to call from run(). */
  abort() {
    this.#abortCtrl.abort();
  }

  /**
   * Work body. Receives a signal that aborts on stop() or the external signal.
   * @param {AbortSignal} _signal
   * @returns {Promise<*>}
   */
  async run( _signal ) {
    throw new Error( `${this.constructor.name} must implement run()` );
  }
}
