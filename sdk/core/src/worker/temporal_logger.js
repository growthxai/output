import { DefaultLogger, makeTelemetryFilterString, Runtime } from '@temporalio/worker';
import { createChildLogger } from '#logger';
import { serializeError } from '#helpers/error_serializer';

const log = createChildLogger( 'Temporal' );
const OMITTED_MESSAGES = [ 'Activity failed', 'Workflow failed' ];

/** Serializes Error values in the meta, otherwise they would be logged as an empty object */
const serializeMetaErrors = meta => meta && Object.fromEntries(
  Object.entries( meta ).map( ( [ key, value ] ) => [ key, value instanceof Error ? serializeError( value ) : value ] )
);

const temporalLevelToInternalLevelMap = {
  TRACE: 'debug',
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error'
};

export const setupTemporalLogger = () => {
  const level = process.env.OUTPUT_TEMPORAL_LOG_LEVEL?.toUpperCase() ?? 'INFO';

  Runtime.install( {
    logger: new DefaultLogger( level, entry => {
      // Already reported by Output activity logs and traces.
      if ( OMITTED_MESSAGES.includes( entry.message ) ) {
        return;
      }
      log.log( temporalLevelToInternalLevelMap[entry.level], entry.message, serializeMetaErrors( entry.meta ) );
    } ),
    telemetryOptions: {
      logging: {
        forward: {},
        filter: makeTelemetryFilterString( { core: level, other: level } )
      }
    }
  } );
};
