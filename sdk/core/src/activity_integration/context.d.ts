/**
 * Context returned by {@link getContext} when running inside a Temporal Activity (step or evaluator).
 */
export type Context = {
  /** Information about the current workflow execution */
  workflow: {
    /** Temporal's workflow execution id */
    id: string;
    /** Workflow name (Temporal's workflow "type" value) */
    name: string;
    /** Path of the workflow file */
    filename: string;
  }
};

/**
 * Returns information about the current Temporal execution.
 *
 * Only available when called from within a step or evaluator (Temporal Activities) running in the Temporal runtime.
 *
 * @remarks
 * - Returns `null` when not called inside a Temporal Activity (steps/evaluators);
 * - Returns `null` when not called from within a running Temporal worker, like in unit tests environment;
 *
 * @returns The workflow context, or `null` if unavailable or incomplete.
 */
export declare function getExecutionContext(): Context | null;
