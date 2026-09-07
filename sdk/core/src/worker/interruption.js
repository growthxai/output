import { serializeError } from '#helpers/error_serializer';
import { createChildLogger } from '#logger';

const log = createChildLogger( 'Interruption' );

const FORCE_QUIT_GRACE_MS = 1000;
const FORCE_QUIT_AFTER_FAILURE_MS = 60_000;
const INTERRUPTION_SIGNALS = [ 'SIGTERM', 'SIGINT', 'SIGUSR2' ];
const UNCAUGHT_ERROR_TYPES = [ 'uncaughtException', 'unhandledRejection' ];

export class KillSignError extends Error {
  name = 'KillSignError';
};

export class UncaughtError extends Error {
  name = 'UncaughtError';
};

const state = { interruptionReceivedAt: null, attached: false };

export const setupInterruptionHandler = abortController => {
  if ( state.attached ) {
    return;
  }
  const handleSignal = signal => {
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
    abortController.abort( new KillSignError( signal ) );
  };
  INTERRUPTION_SIGNALS.forEach( signal => process.on( signal, () => handleSignal( signal ) ) );

  const handleUncaught = ( error, type ) => {
    const uncaughtError = new UncaughtError( type, { cause: error } );
    abortController.abort( uncaughtError );
    setTimeout( () => {
      log.error( 'Uncaught exception shutdown timed out, force quitting...', { error: serializeError( error ) } );
      process.exit( 1 );
    }, FORCE_QUIT_AFTER_FAILURE_MS ).unref();
  };
  UNCAUGHT_ERROR_TYPES.forEach( type => process.on( type, error => handleUncaught( error, type ) ) );

  state.attached = true;
};
