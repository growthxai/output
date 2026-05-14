import { addEventActionWithContext, EventAction, Attribute } from '#tracing';

export { Attribute };

/**
 * Creates a new event.
 *
 * @param {object} args
 * @param {string} args.id - A unique id for the Event.
 * @param {string} args.kind - The kind of Event, like HTTP, DiskWrite, DBOp, etc.
 * @param {string} args.name - The human-friendly name of the Event: query, request, create.
 * @param {object} args.details - Arbitrary data to add to this event, it will be used as the "input" field.
 * @returns {void}
 */
export const addEventStart = ( { id, kind, name, details } ) =>
  addEventActionWithContext( EventAction.START, { kind, name, details, id } );

/**
 * Concludes an event.
 *
 * @param {object} args
 * @param {string} args.id - The id of the event to conclude.
 * @param {object} args.details - Arbitrary data to add to this event, it will be used as the "output" field.
 * @returns {void}
 */
export const addEventEnd = ( { id, details } ) => addEventActionWithContext( EventAction.END, { id, details } );

/**
 * Concludes an event with an error.
 *
 * @param {object} args
 * @param {string} args.id - The id of the event to conclude.
 * @param {object} args.details - Arbitrary data to add to this event, it will be used as the "error" field.
 * @returns {void}
 */
export const addEventError = ( { id, details } ) => addEventActionWithContext( EventAction.ERROR, { id, details } );

/**
 * Adds an attribute to an event.
 *
 * @param {object} args
 * @param {string} args.eventId - The id of the event to attach the attribute to.
 * @param {string} args.name - The attribute name
 * @param {unknown} args.value - The attribute value
 * @returns {void}
 */
export const addEventAttribute = ( { eventId, name, value } ) =>
  addEventActionWithContext( EventAction.ADD_ATTR, { id: eventId, details: { name, value } } );
