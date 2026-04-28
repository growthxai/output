/**
 * Creates a new event.
 *
 * @param args
 * @param args.id - A unique id for the Event.
 * @param args.kind - The kind of Event, like HTTP, DiskWrite, DBOp, etc.
 * @param args.name - The human-friendly name of the Event: query, request, create.
 * @param args.details - Arbitrary data to add to this event, it will be used as the "input" field.
 */
export declare function addEventStart( args: { id: string; kind: string; name: string; details: unknown } ): void;

/**
 * Concludes an event.
 *
 * @param args
 * @param args.id - The id of the event to conclude.
 * @param args.details - Arbitrary data to add to this event, it will be used as the "output" field.
 */
export declare function addEventEnd( args: { id: string; details: unknown } ): void;

/**
 * Concludes an event with an error.
 *
 * @param args
 * @param args.id - The id of the event to conclude.
 * @param args.details - Arbitrary data to add to this event, it will be used as the "error" field.
 */
export declare function addEventError( args: { id: string; details: unknown } ): void;

/**
 * Adds an attribute to an event.
 *
 * @param args
 * @param args.eventId - The id of the event to attach the attribute to.
 * @param args.name - The attribute name
 * @param args.value - The attribute value
 */
export declare function addEventAttribute( args: { eventId: string; name: string, value: unknown } ): void;

/**
 * Known attributes.
 */
export declare const Attribute: {
  COST: 'cost';
};
