import { DefaultLogger, makeTelemetryFilterString, Runtime } from '@temporalio/worker';
import { createChildLogger } from '#logger';

const log = createChildLogger( 'Temporal' );
const OMITTED_MESSAGES = [ 'Activity failed', 'Workflow failed' ];

export const setupTemporalLogger = () => {
  const level = process.env.OUTPUT_TEMPORAL_LOG_LEVEL?.toUpperCase() ?? 'INFO';

  Runtime.install( {
    logger: new DefaultLogger( level, entry => {
      // Already reported by Output activity logs and traces.
      if ( OMITTED_MESSAGES.includes( entry.message ) ) {
        return;
      }
      log.log( entry.level.toLowerCase(), entry.message, entry.meta );
    } ),
    telemetryOptions: {
      logging: {
        forward: {},
        filter: makeTelemetryFilterString( { core: level, other: level } )
      }
    }
  } );
};
