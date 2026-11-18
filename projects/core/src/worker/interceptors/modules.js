import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );

/**
 * Workflow-side interceptor modules bundled into the workflow code.
 *
 * Kept in its own module — free of activity/config imports — so the bundle check
 * (`bundleWorkflows`) can register the exact same modules as the worker without
 * pulling in worker runtime config (e.g. the OUTPUT_CATALOG_ID env validation).
 * This is the single source of truth shared by `initInterceptors` and the check,
 * keeping `output-worker --check` in parity with `Worker.create`.
 */
export const workflowInterceptorModules = [ join( __dirname, './workflow.js' ) ];
