import { mainEventBus } from '#bus';
import { WORKER_LOGGER_SYMBOL, BusEventType } from '#consts';
import { activityInfo as activityInfoFn, asyncLocalStorage } from '@temporalio/activity';
import { assignImmutableProperty } from '#helpers/object';

/**
 * Sets global functions on globalThis
 */
export const bindGlobalFunctions = () => {
  /** Defines the activity logger function, accessible in activity context via logger interface */
  assignImmutableProperty( globalThis, WORKER_LOGGER_SYMBOL, ( { level, message, metadata } ) => {
    const context = asyncLocalStorage.getStore();
    if ( context ) { // means we are in an activity
      mainEventBus.emit( BusEventType.ACTIVITY_LOG, { level, message, metadata, activityInfo: activityInfoFn() } );
    } else { // means we are at the worker level, maybe a hook, but not inside the sandbox
      mainEventBus.emit( BusEventType.WORKER_LOG, { level, message, metadata } );
    }
  } );
};
