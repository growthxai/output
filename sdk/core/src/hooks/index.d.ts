/**
 * Payload passed to the onError handler when a workflow, activity or runtime error occurs.
 */
export interface ErrorHookPayload {
  /** Origin of the error: workflow execution, activity execution, or runtime. */
  source: 'workflow' | 'activity' | 'runtime';
  /** Name of the workflow, when the error is scoped to a workflow or activity. */
  workflowName?: string;
  /** Name of the activity, when the error is from an activity. */
  activityName?: string;
  /** The error thrown. */
  error: Error;
}

/**
 * Register a handler to be invoked on workflow, activity or runtime errors.
 *
 * @param handler - Function called with the error payload.
 */
export declare function onError( handler: ( payload: ErrorHookPayload ) => void ): void;

/**
 * Register a handler to be invoked once, before the worker starts processing tasks.
 * Runs synchronously after activities are loaded and before Worker.create().
 *
 * @param handler - Function called with no arguments.
 */
export declare function onBeforeStart( handler: () => void ): void;

/**
 * Register a handler to be invoked when a given event happens
 *
 * @param eventName - The name of the event to subscribe
 * @param handler - Function called with the event payload
 */
export declare function on( eventName: string, handler: ( payload: object ) => void ): void;
