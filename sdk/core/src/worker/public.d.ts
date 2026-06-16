/**
 * Public worker surface (`@outputai/core/worker`) — side-effect-free.
 *
 * Importing this module does not start a worker.
 */

/** A bundled workflow module produced by the Temporal webpack bundler. */
export interface WorkflowBundle {
  code: string;
  sourceMap: string;
}

/**
 * Bundle a project's workflows exactly as the worker does, without a Temporal server.
 * Rejects if the bundler fails (e.g. a `node:` built-in in a transitive import).
 */
export declare function bundleWorkflows( rootDir: string ): Promise<WorkflowBundle>;
