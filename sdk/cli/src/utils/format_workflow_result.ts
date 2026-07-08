import type { WorkflowResultResponse, WorkflowResultResponseStatus } from '../api/generated/api.js';
import { normalizeWorkflowStatus } from './normalize_workflow_status.js';

type WorkflowResult = Pick<WorkflowResultResponse, 'workflowId' | 'output' | 'status' | 'error'>;

export const ERROR_STATUSES: ReadonlySet<WorkflowResultResponseStatus | undefined> = new Set(
  [ 'failed', 'canceled', 'terminated', 'timed_out' ] as const
);

// Every error status plus the one success status — derived so the two sets can't
// silently drift apart as error statuses evolve. Shared by `workflow monitor` and
// the dev TUI's `useRunDetail`/`useStepGraph` so both agree on what "done" means.
export const TERMINAL_STATUSES: ReadonlySet<string> = new Set( [ 'completed', ...ERROR_STATUSES ] as string[] );

export function formatWorkflowResult( result: WorkflowResult ): string {
  const status = normalizeWorkflowStatus( result.status );
  const lines = [
    `Workflow ID: ${result.workflowId || 'unknown'}`,
    ''
  ];

  if ( status === 'completed' ) {
    lines.push( 'Output:' );
    lines.push( JSON.stringify( result.output, null, 2 ) );
  } else {
    lines.push( `Status: ${status || 'unknown'}` );
    if ( result.error ) {
      lines.push( `Error: ${result.error}` );
    }
  }

  return lines.join( '\n' );
}
