import type { WorkflowResultResponse, WorkflowResultResponseStatus } from '../api/generated/api.js';

type WorkflowResult = Pick<WorkflowResultResponse, 'workflowId' | 'output' | 'status' | 'error'>;

export const ERROR_STATUSES: ReadonlySet<WorkflowResultResponseStatus | undefined> = new Set(
  [ 'failed', 'canceled', 'terminated', 'timed_out' ] as const
);

export function formatWorkflowResult( result: WorkflowResult ): string {
  const lines = [
    `Workflow ID: ${result.workflowId || 'unknown'}`,
    ''
  ];

  if ( result.status === 'completed' ) {
    lines.push( 'Output:' );
    lines.push( JSON.stringify( result.output, null, 2 ) );
  } else {
    lines.push( `Status: ${result.status || 'unknown'}` );
    if ( result.error ) {
      lines.push( `Error: ${result.error}` );
    }
  }

  return lines.join( '\n' );
}
