import { serializeError } from '#helpers/error_serializer';
import { createChildLogger } from '#logger';

const log = createChildLogger( 'Interruption' );

const DOUBLE_SIGNAL_IGNORE_TIME = 1000;
const KILL_AFTER_UNCAUGHT_TIME = 60_000;
const INTERRUPTION_SIGNALS = [ 'SIGTERM', 'SIGINT', 'SIGUSR2' ];
const UNCAUGHT_ERROR_TYPES = [ 'uncaughtException', 'unhandledRejection' ];

export class KillSignError extends Error {
  name = 'KillSignError';
};

export class UncaughtError extends Error {
  name = 'UncaughtError';
};

const state = {
  lastSignalDate: null,
  setupCompleted: false,
  uncaughtHandled: false,
  abortController: null
};

/** Creates a countdown to kill the code */
const createTerminationWatchdog = ( message, timeoutMs ) =>
  setTimeout( () => {
    log.warn( message );
    process.exit( 1 );
  }, timeoutMs ).unref();

/** Handles a signal interruption */
const handleSignal = signal => {
  log.info( 'Signal Received', { signal } );

  if ( state.lastSignalDate ) {
    const elapsed = Date.now() - state.lastSignalDate;

    // If running with npx, 2 kill signals are received in rapid succession,
    // this ignores the second interruption when it is right after the first.
    if ( elapsed > DOUBLE_SIGNAL_IGNORE_TIME ) {
      log.warn( 'Force quitting...' );
      process.exit( 1 );
    }
    return;
  }

  state.lastSignalDate = Date.now();
  state.abortController.abort( new KillSignError( signal ) );
};

/** handles uncaught exceptions, unhandled promises */
const handleUncaught = ( error, type ) => {
  log.warn( 'Uncaught exception', { type, error: serializeError( error ) } );

  if ( !state.uncaughtHandled ) {
    state.abortController.abort( new UncaughtError( type, { cause: error } ) );
    // after detecting an uncaught exception, starts a countdown, if the code doesn't finish in time, force quit
    createTerminationWatchdog( 'Uncaught exception handling timed out, force quitting...', KILL_AFTER_UNCAUGHT_TIME );
    state.uncaughtHandled = true;
  }
};

export const setupInterruptionHandler = abortController => {
  if ( !state.setupCompleted ) {
    state.abortController = abortController;
    INTERRUPTION_SIGNALS.forEach( signal => process.on( signal, () => handleSignal( signal ) ) );
    UNCAUGHT_ERROR_TYPES.forEach( type => process.on( type, error => handleUncaught( error, type ) ) );
    state.setupCompleted = true;
  }
};
