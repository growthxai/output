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
 * Attribute totals collected while an activity executes.
 */
export interface Aggregations {
  /** Cost totals collected from HTTP request cost and LLM usage attributes. */
  cost: {
    total: number;
  };
  /** Token totals collected from LLM usage attributes. */
  tokens: {
    [tokenType: string]: number | undefined;
    total: number;
  };
  /** HTTP request count totals. */
  httpRequests: {
    total: number;
  };
}

/**
 * Common lifecycle hook payload fields for events associated with a workflow.
 */
export interface HookPayloadBase {
  /** UUID v4 stamped per emit. Stable per-emit idempotency key. */
  eventId: string;
  /** Timestamp of the event */
  eventDate: number;
  /** Information about the current workflow execution */
  workflowDetails: WorkflowDetails;
}

/**
 * Common hook payload fields for events associated with an activity.
 */
export interface ActivityPayloadBase extends HookPayloadBase {
  /** Temporal's activityInfo(). */
  activityInfo: Info;
  /** Output component kind for the activity, e.g. step, evaluator, or internal_step. */
  outputActivityKind: string;
}

/**
 * Payload passed to the onError() handler when a workflow, activity or runtime error occurs.
 */
export interface ErrorHookPayload {
  /** UUID v4 stamped per emit. Stable per-emit idempotency key. */
  eventId: string;
  /** Timestamp of the event */
  eventDate: number;
  /** Origin of the error: workflow execution, activity execution, or runtime. */
  source: 'workflow' | 'activity' | 'runtime';
  /** Information about the current workflow execution */
  workflowDetails?: WorkflowDetails;
  /** Temporal's activityInfo(). If source is activity */
  activityInfo?: Info;
  /** Output component kind for the activity, e.g. step, evaluator, or internal_step. */
  outputActivityKind?: string;
  /** Attribute totals collected during the activity execution. */
  aggregations?: Aggregations | null;
  /** The error thrown. */
  error: Error;
}

/**
 * Payload passed to the onWorkflowStart() handler when a workflow run begins.
 */
export type WorkflowStartHookPayload = HookPayloadBase;

/**
 * Payload passed to the onWorkflowEnd() handler when a workflow run completes successfully.
 */
export type WorkflowEndHookPayload = HookPayloadBase;

/**
 * Payload passed to the onWorkflowError() handler when a workflow run fails.
 */
export interface WorkflowErrorHookPayload extends HookPayloadBase {
  /** The error thrown. */
  error: Error;
}

/**
 * Common activity lifecycle hook payload fields.
 */
export type ActivityHookPayload = ActivityPayloadBase;

/**
 * Payload passed to the onActivityStart() handler when an activity starts.
 */
export type ActivityStartHookPayload = ActivityHookPayload;

/**
 * Payload passed to the onActivityEnd() handler when an activity completes successfully.
 */
export interface ActivityEndHookPayload extends ActivityHookPayload {
  /** Attribute totals collected during the activity execution. */
  aggregations: Aggregations | null;
}

/**
 * Payload passed to the onActivityError() handler when an activity fails.
 */
export interface ActivityErrorHookPayload extends ActivityHookPayload {
  /** Attribute totals collected during the activity execution. */
  aggregations: Aggregations | null;
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
 * Register a handler to be invoked when an activity starts.
 *
 * @param handler - Function called with the activity start payload.
 */
export declare function onActivityStart( handler: ( payload: ActivityStartHookPayload ) => void ): void;

/**
 * Register a handler to be invoked when an activity completes successfully.
 *
 * @param handler - Function called with the activity end payload.
 */
export declare function onActivityEnd( handler: ( payload: ActivityEndHookPayload ) => void ): void;

/**
 * Register a handler to be invoked when an activity fails.
 *
 * @param handler - Function called with the activity error payload.
 */
export declare function onActivityError( handler: ( payload: ActivityErrorHookPayload ) => void ): void;

/**
 * Framework-managed envelope added to payloads passed to on() handlers.
 */
export interface OnHookEnvelope extends HookPayloadBase {
  /** Temporal's activityInfo(). */
  activityInfo: Info;
  /** Output component kind for the activity, e.g. step, evaluator, or internal_step. */
  outputActivityKind: string;
}

export type OnHookPayload<TPayload = unknown> =
  OnHookEnvelope & {
    /** Event-specific payload supplied by the SDK or emit(). */
    payload: TPayload | undefined;
  };

/**
 * Emit a custom event from the current activity.
 *
 * @param eventName - The name of the event to emit.
 * @param payload - Optional value forwarded to on() handlers.
 */
export declare function emit(
  eventName: string,
  payload?: unknown
): boolean;

/**
 * Register a handler to be invoked when a given event happens
 *
 * @param eventName - The name of the event to subscribe
 * @param handler - Function called with the event payload
 */
export declare function on<TPayload = unknown>(
  eventName: string,
  handler: ( event: OnHookPayload<TPayload> ) => void
): void;
