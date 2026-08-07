import type { WorkflowResultResponse, WorkflowResultResponseStatus } from '../api/generated/api.js';
import { normalizeWorkflowStatus } from './normalize_workflow_status.js';

type WorkflowResult = Pick<WorkflowResultResponse, 'workflowId' | 'output' | 'status' | 'error'>;

// `satisfies` rather than a plain annotation: it pins these to the generated API
// union without widening them, so regenerating the API with a renamed status
// breaks the build instead of silently making that status non-terminal.
const ERROR_STATUS_VALUES = [
  'failed', 'canceled', 'terminated', 'timed_out'
] as const satisfies readonly WorkflowResultResponseStatus[];

export type ErrorStatus = typeof ERROR_STATUS_VALUES[number];
// Every error status plus the one success status — derived so the two can't
// silently drift apart as error statuses evolve. Shared by `workflow monitor` and
// the dev TUI's `useRunDetail`/`useStepGraph` so both agree on what "done" means.
export type TerminalStatus = 'completed' | ErrorStatus;

const ERROR_STATUSES: ReadonlySet<string> = new Set( ERROR_STATUS_VALUES );
const TERMINAL_STATUSES: ReadonlySet<string> = new Set<string>( [ 'completed', ...ERROR_STATUS_VALUES ] );

/**
 * Type predicates, not bare `Set.has` calls: statuses arrive as bare strings from
 * the history API (`WorkflowMeta.status` is `string`, and the server can emit
 * values outside the union such as `unspecified`), so a caller that cast to the
 * union to satisfy a typed set would silently classify an unrecognized status as
 * neither terminal nor failed — a failing workflow exiting 0. Narrowing instead
 * removes the cast and carries the union through to callers.
 */
export const isErrorStatus = ( status: string | null | undefined ): status is ErrorStatus =>
  typeof status === 'string' && ERROR_STATUSES.has( status );

export const isTerminalStatus = ( status: string | null | undefined ): status is TerminalStatus =>
  typeof status === 'string' && TERMINAL_STATUSES.has( status );

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
