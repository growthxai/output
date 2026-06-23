import { messageBus } from '#bus';
import { ACTIVITY_LOGGER_SYMBOL, BusEventType } from '#consts';
import { activityInfo as activityInfoFn } from '@temporalio/activity';

const setFunction = ( key, fn ) => Object.defineProperty( globalThis, key, {
  value: fn,
  enumerable: false,
  configurable: false,
  writable: false
} );

/**
 * Sets global functions on globalThis
 */
export const bindGlobalFunctions = () => {
  /** Defines the activity logger function, accessible in activity context via logger interface */
  setFunction( ACTIVITY_LOGGER_SYMBOL, ( { level, message, metadata } ) =>
    messageBus.emit( BusEventType.ACTIVITY_LOG, { level, message, metadata, activityInfo: activityInfoFn() } )
  );
};
