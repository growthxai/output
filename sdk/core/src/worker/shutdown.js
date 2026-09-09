import { serializeError } from '#helpers/error_serializer';
import { createChildLogger } from '#logger';

const log = createChildLogger( 'Worker Shutdown' );

/* Gracefully shutdown all services, ignore errors */
export const shutdownServices = async ( { workerRunner, connectionMonitor, catalogPublisher, connection } ) => {
  const shutdownJobs = [
    { label: 'Stopping Worker', isActive: () => workerRunner?.running, stop: () => workerRunner.stop() },
    { label: 'Stopping Connection Monitor', isActive: () => connectionMonitor?.running, stop: () => connectionMonitor.stop() },
    { label: 'Interrupting Catalog Publisher', isActive: () => catalogPublisher?.running, stop: () => catalogPublisher.interrupt() },
    { label: 'Closing Connection', isActive: () => connection, stop: () => connection.close() }
  ];
  for ( const { label, isActive, stop } of shutdownJobs ) {
    if ( isActive() ) {
      log.info( `${label}...` );
      await stop().catch( e => log.warn( `${label} error`, { error: serializeError( e ) } ) );
    }
  }
};
