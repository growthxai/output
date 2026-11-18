import type { WorkflowResultResponse, WorkflowResultStatus } from '../api/generated/api.js';
import { normalizeWorkflowStatus } from './normalize_workflow_status.js';

type WorkflowResult = Pick<WorkflowResultResponse, 'workflowId' | 'output' | 'status' | 'error'>;

// `satisfies` rather than a plain annotation: it pins these to the generated API
// union without widening them, so regenerating the API with a renamed status
// breaks the build instead of silently making that status non-terminal.
const ERROR_STATUS_VALUES = [
  'failed', 'cancelled', 'terminated', 'timed_out'
] as const satisfies readonly WorkflowResultStatus[];

export type ErrorStatus = typeof ERROR_STATUS_VALUES[number];
// Every error status plus the one success status — derived so the two can't
// silently drift apart as error statuses evolve. Shared by `workflow monitor` and
// the dev TUI's `useRunDetail`/`useStepGraph` so both agree on what "done" means.
export type TerminalStatus = 'completed' | ErrorStatus;

const ERROR_STATUSES: ReadonlySet<string> = new Set( ERROR_STATUS_VALUES );
const TERMINAL_STATUSES: ReadonlySet<string> = new Set<string>( [ 'completed', ...ERROR_STATUS_VALUES ] );

/**
 * Maps a raw status to a canonical error status, or `undefined` if it is not one.
 * Legacy spellings (`canceled`) are normalized so callers only ever see the
 * current API vocabulary — until `normalizeWorkflowStatus` is removed.
 */
/* eslint-disable consistent-return -- returns ErrorStatus | undefined via early exit */
export function isErrorStatus( status: string | null | undefined ): ErrorStatus | undefined {
  if ( typeof status !== 'string' ) {
    return undefined;
  }
  const normalized = normalizeWorkflowStatus( status );
  return ERROR_STATUSES.has( normalized ) ? normalized as ErrorStatus : undefined;
}
/* eslint-enable consistent-return */

/**
 * Maps a raw status to a canonical terminal status, or `undefined` if it is not
 * one. Same normalization contract as `isErrorStatus`.
 */
/* eslint-disable consistent-return -- returns TerminalStatus | undefined via early exit */
export function isTerminalStatus( status: string | null | undefined ): TerminalStatus | undefined {
  if ( typeof status !== 'string' ) {
    return undefined;
  }
  const normalized = normalizeWorkflowStatus( status );
  return TERMINAL_STATUSES.has( normalized ) ? normalized as TerminalStatus : undefined;
}
/* eslint-enable consistent-return */

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
      const error = typeof result.error === 'string' ?
        result.error :
        result.error.message ?? JSON.stringify( result.error, null, 2 );
      lines.push( `Error: ${error}` );
    }
  }

  return lines.join( '\n' );
}
