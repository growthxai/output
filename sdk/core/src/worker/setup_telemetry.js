import { createChildLogger } from '#logger';
import { workerTelemetryIntervalMs } from './configs.js';

const log = createChildLogger( 'Telemetry' );

export const setupTelemetry = ( { worker } ) => {
  if ( workerTelemetryIntervalMs > 0 ) {
    setInterval( () => {
      log.info( 'Worker', {
        status: worker.getStatus(),
        memory: {
          availableMemory: process.availableMemory(),
          constrainedMemory: process.constrainedMemory(),
          memoryUsage: process.memoryUsage()
        }
      } );
    }, workerTelemetryIntervalMs ).unref();
  }
};
