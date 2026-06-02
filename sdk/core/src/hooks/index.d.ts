import type { Info } from '@temporalio/activity';

export interface WorkflowDetails {
  /**
   * ID of the Workflow, this can be set by the client during Workflow creation.
   * A single Workflow may run multiple times e.g. when scheduled with cron.
   */
  workflowId: string;
  /**
   * ID of a single Workflow run
   */
  runId: string;
  /**
   * Workflow function's name
   */
  workflowType: string;
  /**
   * Parent Workflow info (present if this is a Child Workflow)
   */
  parent?: {
    /**
     * ID of the Workflow, this can be set by the client during Workflow creation.
     * A single Workflow may run multiple times e.g. when scheduled with cron.
     */
    workflowId: string;
    /**
     * ID of a single Workflow run
     */
    runId: string;
    /**
     * Namespace this Workflow is executing in
     */
    namespace: string;
  };
  /**
   * The root workflow execution, defined as follows:
   * 1. A workflow without a parent workflow is its own root workflow.
   * 2. A workflow with a parent workflow has the same root workflow as
   * its parent.
   *
   * When there is no parent workflow, i.e., the workflow is its own root workflow,
   * this field is `undefined`.
   *
   * Note that Continue-as-New (or reset) propagates the workflow parentage relationship,
   * and therefore, whether the new workflow has the same root workflow as the original one
   * depends on whether it had a parent.
   *
   */
  root?: {
    /**
     * ID of the Workflow, this can be set by the client during Workflow creation.
     * A single Workflow may run multiple times e.g. when scheduled with cron.
     */
    workflowId: string;
    /**
     * ID of a single Workflow run
     */
    runId: string;
  };
  /**
   * Run Id of the first Run in this Execution Chain
   */
  firstExecutionRunId: string;
  /**
   * The last Run Id in this Execution Chain
   */
  continuedFromExecutionRunId?: string;
  /**
   * Time at which this [Workflow Execution Chain](https://docs.temporal.io/workflows#workflow-execution-chain) was started
   */
  startTime: number;
  /**
   * Time at which the current Workflow Run started
   */
  runStartTime: number;
  /**
   * Starts at 1 and increments for every retry if there is a `retryPolicy`
   */
  attempt: number;
}

/**
 * Payload passed to the onError() handler when a workflow, activity or runtime error occurs.
 */
export interface ErrorHookPayload {
  /** UUID v4 stamped per emit. Stable per-emit idempotency key. */
  eventId: string;
  /** Origin of the error: workflow execution, activity execution, or runtime. */
  source: 'workflow' | 'activity' | 'runtime';
  /** Information about the current workflow execution */
  workflowDetails?: WorkflowDetails;
  /** Temporal's activityInfo(). If source is activity */
  activityInfo?: Info;
  /** Output component kind for the activity, e.g. step, evaluator, or internal_step. */
  outputActivityKind?: string;
  /** The error thrown. */
  error: Error;
}

/**
 * Payload passed to the onWorkflowStart() handler when a workflow run begins.
 */
export interface WorkflowStartHookPayload {
  /** UUID v4 stamped per emit. Stable per-emit idempotency key. */
  eventId: string;
  /** Information about the current workflow execution */
  workflowDetails: WorkflowDetails;
}

/**
 * Payload passed to the onWorkflowEnd() handler when a workflow run completes successfully.
 */
export interface WorkflowEndHookPayload {
  /** UUID v4 stamped per emit. Stable per-emit idempotency key. */
  eventId: string;
  /** Information about the current workflow execution */
  workflowDetails: WorkflowDetails;
}

/**
 * Payload passed to the onWorkflowError() handler when a workflow run fails.
 */
export interface WorkflowErrorHookPayload {
  /** UUID v4 stamped per emit. Stable per-emit idempotency key. */
  eventId: string;
  /** Information about the current workflow execution */
  workflowDetails: WorkflowDetails;
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
 * It is invoked before Worker.create().
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
 * Framework-managed envelope added to payloads passed to on() handlers.
 */
export interface OnHookEnvelope {
  /** UUID v4 stamped per emit. Stable per-emit idempotency key. */
  eventId: string;
  /** Information about the current workflow execution */
  workflowDetails: WorkflowDetails;
  /** Temporal's activityInfo(). */
  activityInfo: Info;
  /** Output component kind for the activity, e.g. step, evaluator, or internal_step. */
  outputActivityKind?: string;
}

export type OnHookPayload<TAttributes extends Record<string, unknown> = Record<string, unknown>> =
  OnHookEnvelope & TAttributes;

/**
 * Register a handler to be invoked when a given event happens
 *
 * @param eventName - The name of the event to subscribe
 * @param handler - Function called with the event payload
 */
export declare function on<TAttributes extends Record<string, unknown> = Record<string, unknown>>(
  eventName: string,
  handler: ( payload: OnHookPayload<TAttributes> ) => void
): void;
