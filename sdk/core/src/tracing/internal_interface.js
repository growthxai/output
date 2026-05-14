import { addEventAction, addEventActionWithContext, init, getDestinations } from './trace_engine.js';
import { EventAction, Attribute } from './trace_consts.js';

/**
 * Init method, if not called, no processors are attached and trace functions are dummy
 */
export { init, getDestinations };

/**
 * Internal use only - adds an action with AsyncLocalStorage context resolution
 */
export { addEventActionWithContext };

export { EventAction, Attribute };

/**
 * Trace nomenclature
 *
 * Trace - The collection of Events;
 * Event - Any entry in the Trace file must have both START and END/ERROR actions, plus any number of ADD_ATTR actions;
 * Action - A specific part of an Event: START, END, ERROR, or ADD_ATTR;
 */

/**
 * Internal use only
 *
 * Creates a new event and appends it to the trace.
 *
 * @param {object} args
 * @param {string} args.id - A unique id for the Event.
 * @param {string} args.kind - The kind of Event, like HTTP, DiskWrite, DBOp, etc.
 * @param {string} args.name - The human-friendly name of the Event: query, request, create.
 * @param {any} args.details - Arbitrary data to add to this event, it will be used as the "input" field.
 * @param {string} args.parentId - The parent Event, used to build a tree.
 * @param {object} args.executionContext - The original execution context from the workflow
 * @returns {void}
 */
export const addEventStart = options => addEventAction( EventAction.START, options );

/**
 * Internal use only
 *
 * Concludes an event, matching by its id.
 *
 * @param {object} args
 * @param {string} args.id - The id of the event to conclude.
 * @param {any} args.details - Arbitrary data to add to the event; it is used as the "output" field.
 * @param {object} args.executionContext - The original execution context from the workflow
 * @returns {void}
 */
export const addEventEnd = options => addEventAction( EventAction.END, options );

/**
 * Internal use only
 *
 * Concludes an event with an error, matching by its id.
 *
 * @param {object} args
 * @param {string} args.id - The id of the event to conclude.
 * @param {any} args.details - Arbitrary data to add to the event; it is used as the "error" field.
 * @param {object} args.executionContext - The original execution context from the workflow
 * @returns {void}
 */
export const addEventError = options => addEventAction( EventAction.ERROR, options );

/**
 * Internal use only
 *
 * Adds an attribute to an event using its id.
 *
 * @param {object} args
 * @param {string} args.id - The id of the event to attach the attribute to.
 * @param {object} args.details - The attribute to add to this event, must be in `{ name: string, value: any }` format.
 * @param {object} args.executionContext - The original execution context from the workflow
 * @returns {void}
 */
export const addEventAttribute = options => addEventAction( EventAction.ADD_ATTR, options );
