/**
 * Emits a custom event on the in-process message bus.
 *
 * The framework automatically attaches `workflowId`, `runId`, and `activityId`
 * (pulled from `executionContext`) onto every emitted payload, so consumer
 * subscribers registered via `on(...)` always receive those identifiers
 * alongside whatever custom fields the emitter supplies.
 *
 * @param eventName - The name of the event to emit
 * @param payload - An optional payload to send to the event
 */
export declare function emitEvent( eventName: string, payload?: unknown ): void;
