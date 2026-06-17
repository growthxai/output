import { bundleWorkflowCode } from '@temporalio/worker';
import { loadWorkflows, loadActivities, createWorkflowsEntryPoint } from './loader.js';
import { webpackConfigHook } from './bundler_options.js';
import { workflowInterceptorModules } from './interceptors/modules.js';

/**
 * Bundle a project's workflows exactly as the worker does, without a Temporal server.
 *
 * Mirrors the worker's startup prep (`loadWorkflows` -> `loadActivities` ->
 * `createWorkflowsEntryPoint`) and then runs the same bundler (`bundleWorkflowCode`)
 * with the same inputs `Worker.create` derives — `webpackConfigHook` and
 * `workflowInterceptorModules` — so it stays in parity with worker startup. Rejects if
 * the Temporal webpack bundler fails, e.g. a `node:` built-in in the workflow's
 * transitive import graph.
 *
 * @param {string} rootDir directory to discover workflows in
 * @returns {Promise<import('@temporalio/worker').WorkflowBundleWithSourceMap>}
 */
export async function bundleWorkflows( rootDir ) {
  const workflows = await loadWorkflows( rootDir );
  // Writes worker/temp/__activity_options.js, which the workflow interceptor module
  // imports — the worker generates it via loadActivities() before Worker.create bundles.
  await loadActivities( rootDir, workflows );
  const workflowsPath = createWorkflowsEntryPoint( workflows );
  return bundleWorkflowCode( { workflowsPath, workflowInterceptorModules, webpackConfigHook } );
}
