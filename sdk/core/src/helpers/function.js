/**
 * Returns a function that invokes the fn argument only once when called, further calls do nothing.
 * @param {Function} fn
 * @returns {Function}
 */
export const runOnce = fn => {
  const state = { executed: false, result: undefined };
  return ( ...args ) => {
    if ( !state.executed ) {
      state.executed = true;
      return state.result = fn( ...args );
    }
    return state.result;
  };
};

/**
 * Calls a given function and in case it throws errors, returns `undefined`
 * @param {Function} fn
 * @returns {unknown|undefined}
 */
export const tryOrUndefined = fn => {
  try {
    return fn();
  } catch {
    return undefined; // eslint-disable-line consistent-return
  }
};
