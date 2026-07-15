import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { Storage } from '#async_storage';
import { WORKFLOW_CATALOG } from '#consts';

const mainEventBus = new EventEmitter();
const stepEventBus = new EventEmitter();

const getContext = () => {
  const ctx = Storage.load();
  if ( ctx ) {
    const { outputActivityKind, activityInfo, workflowDetails } = ctx;
    return { outputActivityKind, activityInfo, workflowDetails };
  }
  return {};
};

/**
 * Attaches information and filter out events from the bus by proxying .emit().
 *
 * If createEnvelope=true, wrap payload:
 * ```js
 * {
 *   eventId,
 *   eventDate,
 *   outputActivityKind,
 *   activityInfo,
 *   workflowDetails,
 *   payload: <original payload>
 * }
 * ```
 *
 * if createEnvelope=false, adds eventId and eventDate to the original payload object
 *
 * @param {object} args
 * @param {object} args.bus The event emitter to proxy
 * @param {boolean} args.createEnvelope Whether to wrap event around an envelope
 * @param {function} args.filter Filter function to drop events
 */
const proxyBus = ( { bus, createEnvelope = false, filter } ) => {
  bus.emit = new Proxy( bus.emit, {
    apply( target, thisArg, args ) {
      const [ eventName, payload, ...rest ] = args;

      const shouldEmit = filter?.( eventName, payload ) ?? true;
      if ( !shouldEmit ) {
        return false;
      }

      const eventFields = {
        eventId: randomUUID(),
        eventDate: Date.now()
      };

      const newPayload = createEnvelope ? { ...eventFields, ...getContext(), payload } : { ...eventFields, ...payload };
      return Reflect.apply( target, thisArg, [ eventName, newPayload, ...rest ] );
    }
  } );
};

const catalogWfFilter = ( _, payload ) => payload?.workflowDetails?.workflowType !== WORKFLOW_CATALOG;

// Main bus is not used inside steps, so it doesn't need context
proxyBus( { bus: mainEventBus, createEnvelope: false, filter: catalogWfFilter } );
// This receives SDK and user events from within steps, so add context to it
proxyBus( { bus: stepEventBus, createEnvelope: true } );

export { mainEventBus, stepEventBus };
