import { addEventPhase, addEventPhaseWithContext, init, getDestinations } from './trace_engine.js';

/**
 * Init method, if not called, no processors are attached and trace functions are dummy
 */
export { init, getDestinations };

/**
 * Internal use only - adds event phase with AsyncLocalStorage context resolution
 */
export { addEventPhaseWithContext };

/**
 * Trace nomenclature
 *
 * Trace - The collection of Events;
 * Event - Any entry in the Trace file, must have the two phases START and END or ERROR;
 * Phase - An specific part of an Event, either START or the conclusive END or ERROR;
 */

/**
 * Internal use only
 *
 * Adds the start phase of a new event at the default trace for the current workflow.
 *
 * @param {object} args
 * @param {string} args.id - A unique id for the Event, must be the same across all phases: start, end, error.
 * @param {string} args.kind - The kind of Event, like HTTP, DiskWrite, DBOp, etc.
 * @param {string} args.name - The human friendly name of the Event: query, request, create.
 * @param {any} args.details - All details attached to this Event Phase. DB queried records, HTTP response body.
 * @param {string} args.parentId - The parent Event, used to build a three.
 * @param {object} args.executionContext - The original execution context from the workflow
 * @returns {void}
 */
export const addEventStart = options => addEventPhase( 'start', options );

/**
 * Internal use only
 *
 * Adds the end phase at an event at the default trace for the current workflow.
 *
 * It needs to use the same id of the start phase.
 *
 * @param {object} args
 * @param {string} args.id - A unique id for the Event, must be the same across all phases: start, end, error.
 * @param {string} args.kind - The kind of Event, like HTTP, DiskWrite, DBOp, etc.
 * @param {string} args.name - The human friendly name of the Event: query, request, create.
 * @param {any} args.details - All details attached to this Event Phase. DB queried records, HTTP response body.
 * @param {string} args.parentId - The parent Event, used to build a three.
 * @param {object} args.executionContext - The original execution context from the workflow
 * @returns {void}
 */
export const addEventEnd = options => addEventPhase( 'end', options );

/**
 * Internal use only
 *
 * Adds the error phase at an event as error at the default trace for the current workflow.
 *
 * It needs to use the same id of the start phase.
 *
 * @param {object} args
 * @param {string} args.id - A unique id for the Event, must be the same across all phases: start, end, error.
 * @param {string} args.kind - The kind of Event, like HTTP, DiskWrite, DBOp, etc.
 * @param {string} args.name - The human friendly name of the Event: query, request, create.
 * @param {any} args.details - All details attached to this Event Phase. DB queried records, HTTP response body.
 * @param {string} args.parentId - The parent Event, used to build a three.
 * @param {object} args.executionContext - The original execution context from the workflow
 * @returns {void}
 */
export const addEventError = options => addEventPhase( 'error', options );
