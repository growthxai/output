import { inWorkflowContext } from '@temporalio/workflow';
import { proxySinks } from '@temporalio/workflow';
import { validateLogArguments } from './validations/index.js';
import { ACTIVITY_LOGGER_SYMBOL } from '#consts';

// This is inoffensive and can be used outside workflow sandbox
const sinks = proxySinks();

const log = ( level, message, metadata ) => {
  validateLogArguments( { message, metadata } );
  // When inside workflow, use sinks to send logs out
  if ( inWorkflowContext() ) {
    sinks.workflow.log( { level, message, metadata } );
  // When inside activities, use the global function to ship logs
  } else if ( typeof globalThis[ACTIVITY_LOGGER_SYMBOL] === 'function' ) {
    globalThis[ACTIVITY_LOGGER_SYMBOL]( { level, message, metadata } );
  // This fallback is used on unit tests
  } else {
    console.log( `logger.${level}`, message, metadata );
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
