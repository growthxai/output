import { serializeError } from '#helpers/error_serializer';
import { createChildLogger } from '#logger';

const log = createChildLogger( 'Worker Shutdown' );

/**
 * Gracefully shuts every running service down, in order.
 * A service that fails to stop never interrupts the sequence
 */
export const shutdownServices = async ( { workerRunner, connectionMonitor, catalogPublisher, connection } ) => {
  const shutdownJobs = [
    {
      label: 'Stopping Worker',
      isActive: () => workerRunner?.running,
      stop: () => workerRunner.stop()
    },
    {
      label: 'Stopping Connection Monitor',
      isActive: () => connectionMonitor?.running,
      stop: () => connectionMonitor.stop()
    },
    {
      label: 'Interrupting Catalog Publisher',
      isActive: () => catalogPublisher?.running,
      stop: () => catalogPublisher.interrupt()
    },
    {
      label: 'Closing Connection',
      isActive: () => connection,
      stop: () => connection.close()
    }
  ];

  for ( const { label, isActive, stop } of shutdownJobs ) {
    if ( isActive() ) {
      const shutdownStartedAt = Date.now();
      log.info( `${label}...` );
      // a try covers a service that throws instead of rejecting, which a catch on the promise would miss
      try {
        await stop();
        log.info( `${label} complete`, { shutdownDurationMs: Date.now() - shutdownStartedAt } );
      } catch ( error ) {
        log.warn( `${label} failed`, { error: serializeError( error ), shutdownDurationMs: Date.now() - shutdownStartedAt } );
      }
    }
  }
};
