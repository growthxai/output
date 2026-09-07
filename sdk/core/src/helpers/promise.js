import { setTimeout as delay } from 'node:timers/promises';

export const sleepCancellable = async ( timeoutMs, signal ) => {
  try {
    await delay( timeoutMs, true, { ref: false, signal } );
  } catch ( error ) {
    if ( error?.name !== 'AbortError' ) {
      throw error;
    }
  }
};

/**
 * Builds a promise that can be resolved from the outside.
 */
export class CancellablePromise {
  #promise = null;
  #complete = null;
  #completed = false;

  constructor() {
    this.#promise = new Promise( resolve => {
      this.#complete = () => {
        resolve();
        this.#completed = true;
      };
    } );
  }
  /** Retrieves the promise */
  get promise() {
    return this.#promise;
  }
  /** Returns whether the promise is resolved or not */
  get completed() {
    return this.#completed;
  }
  /** Resolves the promise */
  complete() {
    this.#complete();
  }
};
