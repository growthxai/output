import { mainEventBus } from '#bus';
import { ACTIVITY_LOGGER_SYMBOL, BusEventType } from '#consts';
import { activityInfo as activityInfoFn } from '@temporalio/activity';
import { assignImmutableProperty } from '#helpers/object';

/**
 * Sets global functions on globalThis
 */
export const bindGlobalFunctions = () => {
  /** Defines the activity logger function, accessible in activity context via logger interface */
  assignImmutableProperty( globalThis, ACTIVITY_LOGGER_SYMBOL, ( { level, message, metadata } ) =>
    mainEventBus.emit( BusEventType.ACTIVITY_LOG, { level, message, metadata, activityInfo: activityInfoFn() } )
  );
};
