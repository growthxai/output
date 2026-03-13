/**
 * Record the start of an event on the default trace for the current workflow.
 *
 * @param args - Event information
 * @param args.id - A unique id for the Event, must be the same across all phases: start, end, error.
 * @param args.kind - The kind of Event, like HTTP, DiskWrite, DBOp, etc.
 * @param args.name - The human friendly name of the Event: query, request, create.
 * @param args.details - Arbitrary metadata associated with this phase (e.g., payloads, summaries).
 */
export declare function addEventStart( args: { id: string; kind: string; name: string; details: unknown } ): void;

/**
 * Record the end of an event on the default trace for the current workflow.
 *
 * Use the same id as the start phase to correlate phases.
 *
 * @param args - Event information
 * @param args.id - Identifier matching the event's start phase.
 * @param args.details - Arbitrary metadata associated with this phase (e.g., results, response body).
 */
export declare function addEventEnd( args: { id: string; details: unknown } ): void;

/**
 * Record an error for an event on the default trace for the current workflow.
 *
 * Use the same id as the start phase to correlate phases.
 *
 * @param args - Event metadata for the error phase.
 * @param args.id - Identifier matching the event's start phase.
 * @param args.details - Arbitrary metadata associated with this phase, possible error info.
 */
export declare function addEventError( args: { id: string; details: unknown } ): void;
