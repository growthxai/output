import type { Info } from '@temporalio/activity';
/**
 * Context returned by {@link getActivityContext} when running inside a Temporal Activity (step or evaluator).
 */
export type Context = {
  /** Temporal info about the current activity */
  activityInfo: Info,
  /** Path of the workflow file */
  workflowFilename: string
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
export declare function getActivityContext(): Context | null;
