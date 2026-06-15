/**
 * Public worker surface for building a workflow bundle check (`@outputai/core/worker`).
 *
 * This module is side-effect-free — importing it does not start a worker.
 */

/** A bundled workflow module produced by the Temporal webpack bundler. */
export interface WorkflowBundle {
  code: string;
  sourceMap: string;
}

/** Metadata for a workflow discovered by {@link loadWorkflows}. */
export interface WorkflowModule {
  name: string;
  path: string;
  external?: boolean;
  aliases?: string[];
  [key: string]: unknown;
}

/**
 * Temporal webpack config hook used to bundle workflow code. Installs the
 * `output-workflow-bundle` resolve condition and the workflow validator/rewriter loaders.
 */
export declare function webpackConfigHook<TConfig extends object>( config: TConfig ): TConfig;

/** Discover and import every `workflow.js` under `rootDir` (local + node_modules). */
export declare function loadWorkflows( rootDir: string ): Promise<WorkflowModule[]>;

/** Write a temporary entry module re-exporting all workflows; returns its path. */
export declare function createWorkflowsEntryPoint( workflows: WorkflowModule[] ): string;

/**
 * Bundle a project's workflows exactly as the worker does, without a Temporal server.
 * Rejects if the bundler fails (e.g. a `node:` built-in in a transitive import).
 */
export declare function bundleWorkflows( rootDir: string ): Promise<WorkflowBundle>;
