import { addEventPhaseWithContext, EventPhase } from '#tracing';

/**
 * Adds the start phase of a new event at the default trace for the current workflow.
 *
 * @param {object} args
 * @param {string} args.id - A unique id for the Event, must be the same across all phases: start, end, error.
 * @param {string} args.kind - The kind of Event, like HTTP, DiskWrite, DBOp, etc.
 * @param {string} args.name - The human friendly name of the Event: query, request, create.
 * @param {object} args.details - All details attached to this Event Phase. DB queried records, HTTP response body.
 * @returns {void}
 */
export const addEventStart = ( { id, kind, name, details } ) =>
  addEventPhaseWithContext( EventPhase.START, { kind, name, details, id } );

/**
 * Adds the end phase for an event using its id.
 *
 * @param {object} args
 * @param {string} args.id - A unique id for the Event, must be the same across all phases: start, end, error.
 * @param {object} args.details - All details attached to this Event Phase. DB queried records, HTTP response body.
 * @returns {void}
 */
export const addEventEnd = ( { id, details } ) => addEventPhaseWithContext( EventPhase.END, { id, details } );

/**
 * Adds the error phase for an event using its id.
 *
 * @param {object} args
 * @param {string} args.id - A unique id for the Event, must be the same across all phases: start, end, error.
 * @param {object} args.details - All details attached to this Event Phase. DB queried records, HTTP response body.
 * @returns {void}
 */
export const addEventError = ( { id, details } ) => addEventPhaseWithContext( EventPhase.ERROR, { id, details } );

/**
 * Adds an attribute to an event using the event id
 *
 * @param {object} args
 * @param {string} args.eventId - The id of the event to attach the attribute
 * @param {string} args.name - The attribute name
 * @param {unknown} args.value - The attribute value
 * @returns {void}
 */
export const addEventAttribute = ( { eventId, name, value } ) =>
  addEventPhaseWithContext( EventPhase.ADD_ATTR, { id: eventId, details: { name, value } } );
