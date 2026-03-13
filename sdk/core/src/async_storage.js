import { AsyncLocalStorage } from 'node:async_hooks';

export const store = new AsyncLocalStorage();

export const Storage = {
  /**
   * Execute a code piece wrapped in a function binding a given arbitrary object as context around it so it can be retrieve later
   * @param {Function|AsyncFunction} fn The code to execute wrapped around a function without arguments
   * @param {Object} context The context to bind
   * @returns {any} The result of the `fn` execution
   */
  runWithContext: ( fn, context ) => store.run( context, fn ),

  /**
   * Load the context stored upstream in the chain of calls that lead to this point with `runWithContext`.
   * @returns {any} Stored context
   */
  load: () => store.getStore()
};
