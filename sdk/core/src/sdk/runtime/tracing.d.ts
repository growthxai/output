import { Attribute } from '#trace_attribute';

/**
 * Tools to interact with Tracing
 */
export declare const Tracing: {
  Attribute: typeof Attribute;

  /**
   * Creates a new event.
   *
   * @param args
   * @param args.id - A unique id for the Event.
   * @param args.kind - The kind of Event, like HTTP, DiskWrite, DBOp, etc.
   * @param args.name - The human-friendly name of the Event: query, request, create.
   * @param args.details - Arbitrary data to add to this event, it will be used as the "input" field.
   */
  addEventStart( args: { id: string; kind: string; name: string; details: unknown } ): void;

  /**
   * Concludes an event.
   *
   * @param args
   * @param args.id - The id of the event to conclude.
   * @param args.details - Arbitrary data to add to this event, it will be used as the "output" field.
   */
  addEventEnd( args: { id: string; details: unknown } ): void;

  /**
   * Concludes an event with an error.
   *
   * @param args
   * @param args.id - The id of the event to conclude.
   * @param args.details - Arbitrary data to add to this event, it will be used as the "error" field.
   */
  addEventError( args: { id: string; details: unknown } ): void;

  /**
   * Adds an attribute to an event.
   *
   * @param args
   * @param args.eventId - The id of the event to attach the attribute to.
   * @param args.attribute - The attribute to attach to the event.
   */
  addEventAttribute( args: { eventId: string; attribute: Attribute.Instance } ): void;
};
