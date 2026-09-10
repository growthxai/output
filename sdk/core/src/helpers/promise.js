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
