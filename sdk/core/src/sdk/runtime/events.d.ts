/**
 * Tools to interact with Events
 */
export declare const Event: {

  /**
   * Emits an event on step message bus.
   *
   * @param eventName - The name of the event to emit
   * @param payload - An optional payload to send to the event.
   */
  emit( eventName: string, payload?: object ): boolean;
};
