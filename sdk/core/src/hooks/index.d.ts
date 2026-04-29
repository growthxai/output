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
 * Payload passed to the onWorkflowStart handler when a workflow run begins.
 */
export interface WorkflowStartHookPayload {
  /** Identifier of the workflow run. */
  id: string;
  /** Name of the workflow. */
  name: string;
}

/**
 * Payload passed to the onWorkflowEnd handler when a workflow run completes successfully.
 */
export interface WorkflowEndHookPayload {
  /** Identifier of the workflow run. */
  id: string;
  /** Name of the workflow. */
  name: string;
  /** Duration of the workflow run in milliseconds. */
  duration: number;
}

/**
 * Payload passed to the onWorkflowError handler when a workflow run fails.
 */
export interface WorkflowErrorHookPayload {
  /** Identifier of the workflow run. */
  id: string;
  /** Name of the workflow. */
  name: string;
  /** Elapsed time before failure in milliseconds. */
  duration: number;
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
 * Runs before Worker.create().
 *
 * @param handler - Function called with no arguments.
 */
export declare function onBeforeWorkerStart( handler: () => void ): void;

/**
 * Register a handler to be invoked when a workflow run starts.
 *
 * Excludes the $catalog internal workflow.
 *
 * @param handler - Function called with the workflow start payload.
 */
export declare function onWorkflowStart( handler: ( payload: WorkflowStartHookPayload ) => void ): void;

/**
 * Register a handler to be invoked when a workflow run completes successfully.
 *
 * Excludes the $catalog internal workflow.
 *
 * @param handler - Function called with the workflow end payload.
 */
export declare function onWorkflowEnd( handler: ( payload: WorkflowEndHookPayload ) => void ): void;

/**
 * Register a handler to be invoked when a workflow run fails.
 *
 * Excludes the $catalog internal workflow.
 *
 * @param handler - Function called with the workflow error payload.
 */
export declare function onWorkflowError( handler: ( payload: WorkflowErrorHookPayload ) => void ): void;

/**
 * Register a handler to be invoked when a given event happens
 *
 * @param eventName - The name of the event to subscribe
 * @param handler - Function called with the event payload
 */
export declare function on( eventName: string, handler: ( payload?: object ) => void ): void;
