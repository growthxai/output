import { createChildLogger } from '#logger';

export const pendingHooks = new Set();

const log = createChildLogger( 'Hooks' );
const flushTimeoutMs = 30_000;

/**
 * Await all pending hooks to flush for a certain time
 */
export const flushPendingHooks = async () => {
  const state = { timeout: null };
  try {
    const flushed = await Promise.race( [
      Promise.allSettled( [ ...pendingHooks ] ).then( _ => true ),
      new Promise( r => state.timeout = setTimeout( () => r( false ), flushTimeoutMs ) )
    ] );
    if ( !flushed ) {
      log.warn( 'Some hook callbacks exceeded the timeout and will not be awaited', { count: pendingHooks.size } );
    }
  } finally {
    clearTimeout( state.timeout );
  }
};
