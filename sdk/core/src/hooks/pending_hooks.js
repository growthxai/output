export const pendingHooks = new Set();

const flushTimeoutMs = 30_000;

/**
 * Await all pending hooks to flush for a certain time
 * @returns
 */
export const flushPendingHooks = async () => {
  const state = { timeout: null };
  try {
    await Promise.race( [
      Promise.allSettled( [ ...pendingHooks ] ),
      new Promise( r => state.timeout = setTimeout( r, flushTimeoutMs ) )
    ] );
  } finally {
    clearTimeout( state.timeout );
  }
};
