import { DefaultLogger, GracefulShutdownPeriodExpiredError, Runtime } from '@temporalio/worker';
import { createChildLogger } from '#logger';
import { serializeError } from '#helpers/error_serializer';
import { temporalLogLevel } from './configs.js';

const log = createChildLogger( 'Temporal' );
const OMITTED_MESSAGES = [ 'Activity failed', 'Workflow failed' ];

/** Whether the entry reports the shutdown force time expiring, an expected outcome of a deploy that is logged as a warning, not an error */
const isForcedShutdownEntry = ( { meta } ) => meta?.error instanceof GracefulShutdownPeriodExpiredError;

/** Serializes Error values in the meta, otherwise they would be logged as an empty object */
const serializeMetaErrors = meta => meta && Object.fromEntries(
  Object.entries( meta ).map( ( [ key, value ] ) => [ key, value instanceof Error ? serializeError( value ) : value ] )
);

const TemporalLogLevel = {
  TRACE: 'TRACE',
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR'
};

const temporalToInternalLogLevel = {
  [TemporalLogLevel.TRACE]: 'debug',
  [TemporalLogLevel.DEBUG]: 'debug',
  [TemporalLogLevel.INFO]: 'info',
  [TemporalLogLevel.WARN]: 'warn',
  [TemporalLogLevel.ERROR]: 'error'
};

const temporalLogLevelsOrder = [
  TemporalLogLevel.TRACE,
  TemporalLogLevel.DEBUG,
  TemporalLogLevel.INFO,
  TemporalLogLevel.WARN,
  TemporalLogLevel.ERROR
];

const isLogLevelEnabled = ( configuredLevel, entryLevel ) =>
  temporalLogLevelsOrder.indexOf( entryLevel ) >= temporalLogLevelsOrder.indexOf( configuredLevel );

export const setupTemporalLogger = () => {
  Runtime.install( {
    logger: new DefaultLogger( temporalLogLevel, entry => {
      // Already reported by Output activity logs and traces.
      if ( OMITTED_MESSAGES.includes( entry.message ) ) {
        return;
      }
      const forcedShutdown = isForcedShutdownEntry( entry );
      if ( forcedShutdown && !isLogLevelEnabled( temporalLogLevel, TemporalLogLevel.WARN ) ) {
        return;
      }

      const level = temporalToInternalLogLevel[forcedShutdown ? TemporalLogLevel.WARN : entry.level];
      log.log( level, entry.message, serializeMetaErrors( entry.meta ) );
    } ),
    telemetryOptions: {
      logging: {
        forward: {},
        filter: { core: temporalLogLevel, other: temporalLogLevel }
      }
    }
  } );
};
