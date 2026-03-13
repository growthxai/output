const FORCE_QUIT_GRACE_MS = 1000;

export const registerShutdown = ( { worker, log } ) => {
  const state = { isShuttingDown: false, shutdownStartedAt: null };

  const shutdown = signal => {
    if ( state.isShuttingDown ) {
      const elapsed = Date.now() - state.shutdownStartedAt;

      // If running with npx, 2 kill signals are received in rapid succession,
      // this ignores the second interruption when it is right after the first.
      if ( elapsed < FORCE_QUIT_GRACE_MS ) {
        return;
      }
      log.warn( 'Force quitting...' );
      process.exit( 1 );
    }
    state.isShuttingDown = true;
    state.shutdownStartedAt = Date.now();
    log.info( 'Shutting down...', { signal } );
    worker.shutdown();
  };

  process.on( 'SIGTERM', () => shutdown( 'SIGTERM' ) );
  process.on( 'SIGINT', () => shutdown( 'SIGINT' ) );
};
