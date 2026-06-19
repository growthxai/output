import { createChildLogger } from '#logger';

const log = createChildLogger( 'Interruption' );

const FORCE_QUIT_GRACE_MS = 1000;
const INTERRUPTION_SIGNALS = [ 'SIGTERM', 'SIGINT', 'SIGUSR2' ];

export const setupInterruptionHandler = cb => {
  const state = { interruptionReceivedAt: null };

  const handle = signal => {
    log.info( 'Signal Received', { signal } );

    if ( state.interruptionReceivedAt ) {
      const elapsed = Date.now() - state.interruptionReceivedAt;

      // If running with npx, 2 kill signals are received in rapid succession,
      // this ignores the second interruption when it is right after the first.
      if ( elapsed < FORCE_QUIT_GRACE_MS ) {
        return;
      }
      log.warn( 'Force quitting...' );
      process.exit( 1 );
      return;
    }

    state.interruptionReceivedAt = Date.now();
    log.warn( 'Initiating shutdown...' );
    cb();
  };

  INTERRUPTION_SIGNALS.forEach( signal => process.on( signal, () => handle( signal ) ) );
};
