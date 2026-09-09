import { serializeError } from '#helpers/error_serializer';
import { createChildLogger } from '#logger';

const log = createChildLogger( 'Worker Shutdown' );

/**
 * Gracefully shuts every running service down, in order.
 * A service that fails to stop never interrupts the sequence, it is reported back instead.
 * @returns {Promise<Array<{ service: string, error: Error }>>} one entry per service that failed to stop
 */
export const shutdownServices = async ( { workerRunner, connectionMonitor, catalogPublisher, connection } ) => {
  const shutdownJobs = [
    {
      service: 'worker',
      label: 'Stopping Worker',
      isActive: () => workerRunner?.running,
      stop: () => workerRunner.stop()
    },
    {
      service: 'connection_monitor',
      label: 'Stopping Connection Monitor',
      isActive: () => connectionMonitor?.running,
      stop: () => connectionMonitor.stop()
    },
    {
      service: 'catalog_publisher',
      label: 'Interrupting Catalog Publisher',
      isActive: () => catalogPublisher?.running,
      stop: () => catalogPublisher.interrupt()
    },
    {
      service: 'connection',
      label: 'Closing Connection',
      isActive: () => connection,
      stop: () => connection.close()
    }
  ];

  const failures = [];
  for ( const { service, label, isActive, stop } of shutdownJobs ) {
    if ( isActive() ) {
      log.info( `${label}...` );
      await stop().catch( error => {
        failures.push( { service, error } );
        log.warn( `${label} error`, { error: serializeError( error ) } );
      } );
    }
  }
  return failures;
};
