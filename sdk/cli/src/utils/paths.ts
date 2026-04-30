import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath( import.meta.url );
const __dirname = path.dirname( __filename );

/**
 * Template directory paths
 */
export const TEMPLATE_DIRS = {
  workflow: path.join( __dirname, '..', 'templates', 'workflow' ),
  agent_instructions: path.join( __dirname, '..', 'templates', 'agent_instructions' )
} as const;

/**
 * Default output directories
 */
export const DEFAULT_OUTPUT_DIRS = {
  workflows: 'src/workflows'
} as const;

/**
 * Resolve the output directory path
 */
export function resolveOutputDir( outputDir: string ): string {
  return path.resolve( process.cwd(), outputDir );
}

/**
 * Resolve the project root that holds `src/workflows` / `workflows`.
 *
 * When the CLI is invoked from inside the workflow project (the common
 * case for `output workflow run` and friends) `process.cwd()` already
 * points at the right place. When it's invoked from the repo root with
 * `OUTPUT_WORKFLOWS_DIR=test_workflows` (how `npm run dev` drives
 * `output dev` in this repo), we need to descend into that subdirectory
 * before searching for scenarios.
 */
export function getWorkflowsBasePath(): string {
  const subdir = process.env.OUTPUT_WORKFLOWS_DIR;
  return subdir ? path.resolve( process.cwd(), subdir ) : process.cwd();
}

/**
 * Create target directory path for a workflow
 */
export function createTargetDir( outputDir: string, workflowName: string ): string {
  const resolvedOutputDir = resolveOutputDir( outputDir );
  return path.join( resolvedOutputDir, workflowName );
}

/**
 * Get the template directory for a specific template type
 */
export function getTemplateDir( templateType: keyof typeof TEMPLATE_DIRS ): string {
  return TEMPLATE_DIRS[templateType];
}
