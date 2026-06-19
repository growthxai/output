import { createChildLogger } from '#logger';
import { workerTelemetryIntervalMs } from './configs.js';

const log = createChildLogger( 'Telemetry' );

export const setupTelemetry = ( { worker } ) => {
  if ( workerTelemetryIntervalMs <= 0 ) {
    return;
  }
  setInterval( () => {
    try {
      log.info( 'Worker', {
        status: worker.getStatus(),
        memory: {
          availableMemory: process.availableMemory(),
          constrainedMemory: process.constrainedMemory(),
          memoryUsage: process.memoryUsage()
        }
      } );
    } catch ( error ) {
      log.warn( 'Failure', { error: error.message } );
    }
  }, workerTelemetryIntervalMs ).unref();
};
