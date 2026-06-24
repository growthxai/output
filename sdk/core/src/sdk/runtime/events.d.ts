/**
 * Tools to interact with Events
 */
export declare const Event: {
  /**
   * Emits a custom event on the in-process message bus.
   *
   * When called inside an Output activity context, the framework automatically
   * attaches `activityInfo`, `workflowDetails`, and `outputActivityKind` onto the emitted payload.
   *
   * @param eventName - The name of the event to emit
   * @param payload - An optional payload to send to the event
   */
  emit( eventName: string, payload?: object ): void;
};
