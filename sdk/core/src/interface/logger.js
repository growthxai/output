import { inWorkflowContext } from '@temporalio/workflow';
import { proxySinks } from '@temporalio/workflow';
import { ACTIVITY_LOGGER_SYMBOL } from '#consts';
import { isPlainObject } from '#helpers/object';

const reservedMetadataFields = new Set( [
  // Winston fields
  'label',
  'level',
  'message',
  'metadata',
  'splat',
  'stack',
  'timestamp',
  // reserved fields enriched by us
  'workflowId',
  'workflowType',
  'runId',
  'activityId',
  'activityType',
  'service',
  'environment'
] );

// This is inoffensive and can be used outside workflow sandbox
const sinks = proxySinks();

// Convert npm log levels to console levels
const levelToConsole = {
  error: 'error',
  warn: 'warn',
  info: 'info',
  http: 'log',
  verbose: 'log',
  debug: 'debug',
  silly: 'log'
};

/** Drops reserved keys from object */
const removeReservedFields = obj => Object.fromEntries( Object.entries( obj ).filter( ( [ k ] ) => !reservedMetadataFields.has( k ) ) );

const log = ( level, message, metadata ) => {
  const sanitized = {
    message: String( message ),
    ...( isPlainObject( metadata ) && { metadata: removeReservedFields( metadata ) } )
  };

  // When inside workflow, use sinks to send logs out
  if ( inWorkflowContext() ) {
    sinks.workflow.log( { level, ...sanitized } );
  // When inside activities, use the global function to ship logs
  } else if ( typeof globalThis[ACTIVITY_LOGGER_SYMBOL] === 'function' ) {
    globalThis[ACTIVITY_LOGGER_SYMBOL]( { level, ...sanitized } );
  // This fallback is used on unit tests
  } else {
    console[levelToConsole[level]]( sanitized.message, sanitized.metadata );
  }
};

// Winston uses npm levels by default: https://github.com/winstonjs/winston#logging-levels
export const error = log.bind( null, 'error' );
export const warn = log.bind( null, 'warn' );
export const info = log.bind( null, 'info' );
export const http = log.bind( null, 'http' );
export const verbose = log.bind( null, 'verbose' );
export const debug = log.bind( null, 'debug' );
export const silly = log.bind( null, 'silly' );
