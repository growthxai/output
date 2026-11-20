import { serializeError } from '#helpers/error_serializer';
import { createChildLogger } from '#logger';

const log = createChildLogger( 'Worker Shutdown' );

/**
 * Invokes a shutdown function with logs + timer
 * Must invoke around a try/catch and await, since this handles both throws and rejections
 */
const invokeShutdown = async ( fn, name, startedAt = Date.now() ) => {
  log.info( `Stopping ${name}...` );
  const getElapsed = () => Date.now() - startedAt;
  try {
    await fn();
    log.info( `${name} stopped`, { elapsedMs: getElapsed() } );
  } catch ( error ) {
    log.warn( `${name} failed to stop`, {
      error: serializeError( error ),
      elapsedMs: getElapsed()
    } );
  }
};

/**
 * Gracefully shuts every running service down, in order.
 * A service that fails to stop never interrupts the sequence
 */
export const shutdownServices = async services => {
  if ( services.workerRunner?.running ) {
    await invokeShutdown( () => services.workerRunner.stop(), 'Worker' );
  }
  if ( services.connectionMonitor?.running ) {
    await invokeShutdown( () => services.connectionMonitor.stop(), 'Connection Monitor' );
  }
  if ( services.catalogPublisher?.running ) {
    await invokeShutdown( () => services.catalogPublisher.stop(), 'Catalog Publisher' );
  }
  if ( services.llmPricingDataRetriever?.running ) {
    await invokeShutdown( () => services.llmPricingDataRetriever.stop(), 'LLM Pricing Retriever' );
  }
  if ( services.connection ) {
    await invokeShutdown( () => services.connection.close(), 'Temporal Connection' );
  }
};
