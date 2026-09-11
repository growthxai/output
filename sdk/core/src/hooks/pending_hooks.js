import { createChildLogger } from '#logger';

export const pendingHooks = new Set();

const log = createChildLogger( 'Hooks' );

/**
 * Await all pending hooks to flush for a certain time
 * @param {number} timeoutMs - How long to await the pending hooks before giving up
 */
export const flushPendingHooks = async timeoutMs => {
  const state = { timeout: null };
  try {
    const flushed = await Promise.race( [
      Promise.allSettled( [ ...pendingHooks ] ).then( _ => true ),
      new Promise( r => state.timeout = setTimeout( () => r( false ), timeoutMs ) )
    ] );
    if ( !flushed ) {
      log.warn( 'Some hook callbacks exceeded the timeout and will not be awaited', { count: pendingHooks.size } );
    }
  } finally {
    clearTimeout( state.timeout );
  }
};
