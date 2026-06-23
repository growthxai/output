import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getEvalWorkflowName } from '@outputai/evals';
import { resolveWorkflowDir } from '#utils/workflow_dir.js';

const EVAL_WORKFLOW_FILES = [ 'tests/evals/workflow.ts', 'tests/evals/workflow.js' ];

/**
 * Explain why a `<wf>_eval` workflow isn't registered. When the eval source
 * exists on disk but isn't in the catalog, it almost always means tests/evals
 * never compiled to dist (a tsconfig exclude dropped it) — so point at that
 * instead of a bare WorkflowNotFoundError.
 */
export async function diagnoseMissingEvalWorkflow(
  workflowName: string,
  basePath?: string
): Promise<string> {
  const evalName = getEvalWorkflowName( workflowName );
  const workflowDir = await resolveWorkflowDir( workflowName, basePath );
  const evalSource = workflowDir ?
    EVAL_WORKFLOW_FILES.map( file => resolve( workflowDir, file ) ).find( existsSync ) :
    undefined;

  if ( evalSource ) {
    return [
      `Eval workflow "${evalName}" is not registered, but its source exists at:`,
      `  ${evalSource}`,
      '',
      'This usually means tests/evals did not compile to dist. Check your tsconfig:',
      '  - Ensure tests/evals is not excluded (avoid excluding "src/**/tests").',
      '  - Prefer excluding "**/*.spec.ts" and "**/*.test.ts" instead.',
      '',
      'Rebuild the worker so dist/.../tests/evals/workflow.js exists, then retry.'
    ].join( '\n' );
  }

  return [
    `No eval workflow defined for "${workflowName}".`,
    '',
    `Create an eval workflow at tests/evals/workflow.ts that registers "${evalName}".`
  ].join( '\n' );
}
