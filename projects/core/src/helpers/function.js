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
