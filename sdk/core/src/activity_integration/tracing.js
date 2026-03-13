import { addEventPhaseWithContext } from '#tracing';

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
export const addEventStart = ( { id, kind, name, details } ) => addEventPhaseWithContext( 'start', { kind, name, details, id } );

/**
 * Adds the end phase at an event at the default trace for the current workflow.
 *
 * It needs to use the same id of the start phase.
 *
 * @param {object} args
 * @param {string} args.id - A unique id for the Event, must be the same across all phases: start, end, error.
 * @param {object} args.details - All details attached to this Event Phase. DB queried records, HTTP response body.
 * @returns {void}
 */
export const addEventEnd = ( { id, details } ) => addEventPhaseWithContext( 'end', { id, details } );

/**
 * Adds the error phase at an event as error at the default trace for the current workflow.
 *
 * It needs to use the same id of the start phase.
 *
 * @param {object} args
 * @param {string} args.id - A unique id for the Event, must be the same across all phases: start, end, error.
 * @param {object} args.details - All details attached to this Event Phase. DB queried records, HTTP response body.
 * @returns {void}
 */
export const addEventError = ( { id, details } ) => addEventPhaseWithContext( 'error', { id, details } );
