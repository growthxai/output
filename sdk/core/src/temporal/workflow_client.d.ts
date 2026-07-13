import type { Client, ConnectionLike } from '@temporalio/client';

/**
 * @internal Called by the worker after establishing its Temporal connection.
 */
export declare const registerWorkflowClientConnection: ( options: {
  /** The worker's live NativeConnection */
  connection: ConnectionLike,
  /** The worker's Temporal namespace */
  namespace: string
} ) => void;

/**
 * @internal Called by the worker on shutdown, before closing the connection.
 */
export declare const clearWorkflowClientConnection: () => void;

/**
 * Returns a Temporal {@link Client} that shares the running worker's connection and namespace.
 *
 * Use it from step/evaluator code that needs to interact with workflows directly —
 * e.g. streaming incremental results back to the invoking workflow via signals.
 *
 * @remarks
 * - Only available inside a running Output worker; throws a `FatalError` (non-retryable)
 *   when no worker connection is registered (e.g. unit tests).
 * - The returned client is memoized and shares the worker's live connection —
 *   do not close it.
 */
export declare const getWorkflowClient: () => Client;

/**
 * Sends a signal to the exact workflow run that invoked the current step/evaluator.
 *
 * The target is resolved from the activity context and pinned to the invoking
 * `workflowId` + `runId`, so a stale activity from a previous run can never signal
 * a newer run reusing the same workflowId.
 *
 * @param signalName - The signal name registered by the workflow (`setHandler`)
 * @param args - Signal arguments
 *
 * @remarks
 * - Throws a `FatalError` (non-retryable) when called outside a step/evaluator.
 * - Rejects with Temporal's `WorkflowNotFoundError` when the invoking run is no
 *   longer available (e.g. already completed) — letting the activity fail instead
 *   of signaling into the void.
 */
export declare const signalInvokingWorkflow: ( signalName: string, ...args: unknown[] ) => Promise<void>;
