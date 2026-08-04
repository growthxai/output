import {
  fetchWorkflowHistory, fetchWorkflowHistoryUpdates,
  type WorkflowHistoryCursor, type WorkflowHistoryResult
} from '#services/workflow_history.js';
import type { SpanStatus } from '#services/workflow_history/correlator.js';
import type { WorkflowResultStatus } from '#api/generated/api.js';
import buildSpanLabels from '#utils/span_labels.js';
import { formatDurationLabel } from '#utils/waterfall.js';
import { diffSpanUpdates, formatContinuedAsNew, formatSpanUpdate } from '#utils/monitor_log.js';
import { ERROR_STATUSES, TERMINAL_STATUSES } from '#utils/format_workflow_result.js';
import { getErrorMessage } from '#utils/error_utils.js';
import { sleep } from '#utils/sleep.js';
import { shouldColorize } from '#utils/color.js';
import { HttpError } from '#api/http_client.js';

export const DEFAULT_INTERVAL_MS = 2500;
export const MAX_CONSECUTIVE_ERRORS = 5;
export const SIGINT_EXIT_CODE = 130;
const TRANSIENT_ERROR_CODES = new Set( [ 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND' ] );

export type MonitorStreamOptions = {
  workflowId: string;
  runId?: string;
  includePayloads: boolean;
  interval: number;
  json: boolean;
  color: boolean;
};

/**
 * The command surface the stream needs, kept as a parameter rather than a
 * `Command` instance so `workflow start --monitor` can reuse the loop without
 * constructing (or delegating to) a second oclif command — the repo has no
 * `runCommand` precedent and `Command.run( argv, config )` would need a real
 * oclif `Config` that unit tests don't have. `error` must be typed `never` so
 * callers keep type narrowing after an error branch.
 */
export type MonitorStreamIo = {
  log: ( message: string ) => void;
  warn: ( message: string ) => void;
  error: ( message: string ) => never;
};

/**
 * Distinguishes blips worth retrying from errors that will fail identically on
 * every attempt: network hiccups, a client-side request timeout, and 5xx/408/429
 * responses are transient. Everything else — a 4xx like a stale/invalid resume
 * cursor (`InvalidPageTokenError`, surfaced as 400), or a bug in correlate()/
 * buildResult() re-throwing the same exception — can't self-resolve by waiting,
 * so it should surface immediately instead of burning the retry budget.
 */
function isTransientPollError( error: unknown ): boolean {
  if ( error instanceof HttpError ) {
    const status = error.response.status;
    return status >= 500 || status === 408 || status === 429;
  }
  const err = error as { name?: string; code?: string; cause?: { code?: string } };
  if ( err.name === 'TimeoutError' ) {
    return true;
  }
  return Boolean(
    ( err.code && TRANSIENT_ERROR_CODES.has( err.code ) ) ||
    ( err.cause?.code && TRANSIENT_ERROR_CODES.has( err.cause.code ) )
  );
}

/**
 * Wraps a single poll: a failure on the very first tick propagates (there's
 * nothing to fall back on), but a transient blip (see `isTransientPollError`)
 * after we've already been monitoring successfully just returns `null` so the
 * loop can retry — matching the dev TUI's `useStepGraph` behavior of keeping
 * the last good state on a poll hiccup. A non-transient error (e.g. a stale
 * resume cursor, or a bug in the parsing pipeline) rethrows immediately since
 * retrying it cannot succeed. `MAX_CONSECUTIVE_ERRORS` bounds how long we'll
 * retry transient failures before giving up.
 *
 * Fetch strategy is driven by `state.cursor`, not tick count: no cursor yet
 * (the very first poll, or the first poll of a run chained via continue-as-new)
 * uses `fetchWorkflowHistory` (fast, no long-poll) so that render isn't delayed;
 * once a cursor exists, every poll resumes via `fetchWorkflowHistoryUpdates`
 * instead of re-paging the whole history — see `plan_workflow_monitor_history.md`
 * for why a full re-fetch every tick is expensive for long-running workflows.
 */
async function poll(
  workflowId: string,
  options: { includePayloads: boolean; interval: number },
  state: { runId: string | undefined; firstTick: boolean; consecutiveErrors: number; cursor: WorkflowHistoryCursor | undefined },
  io: MonitorStreamIo
): Promise<{ result: WorkflowHistoryResult; cursor: WorkflowHistoryCursor } | null> {
  try {
    // Keeps the resumed long-poll's server-side block roughly aligned with `--interval`
    // instead of always blocking for the server's full configured deadline regardless of
    // it (see `plan_workflow_monitor_history.md`'s "Known tradeoff" note). Only takes
    // effect once resuming (i.e. from the second tick onward); `fetchWorkflowHistory`
    // ignores it on the initial full walk.
    const fetchOptions = {
      workflowId,
      runId: state.runId,
      includePayloads: options.includePayloads,
      longPollTimeoutMs: options.interval
    };
    if ( !state.cursor ) {
      const result = await fetchWorkflowHistory( fetchOptions );
      return { result, cursor: result.cursor };
    }
    return await fetchWorkflowHistoryUpdates( fetchOptions, state.cursor );
  } catch ( error ) {
    if ( state.firstTick || !isTransientPollError( error ) || state.consecutiveErrors + 1 >= MAX_CONSECUTIVE_ERRORS ) {
      throw error;
    }
    io.warn( `Poll failed (${state.consecutiveErrors + 1}/${MAX_CONSECUTIVE_ERRORS}), retrying: ${getErrorMessage( error )}` );
    return null;
  }
}

/**
 * Polls a workflow run and emits status updates until it reaches a terminal
 * state, following continue-as-new chains. Shared by `workflow monitor` and
 * `workflow start --monitor` so both behave identically; see `MonitorStreamIo`
 * for why output is injected rather than taken from a `Command`.
 *
 * Sets `process.exitCode = 1` on a terminal error status rather than throwing,
 * so the caller's own output (e.g. `start`'s "Workflow started successfully")
 * is still the command's primary result.
 */
export async function streamWorkflowUpdates( options: MonitorStreamOptions, io: MonitorStreamIo ): Promise<void> {
  const color = shouldColorize( options.color );
  const json = options.json;

  // Threaded via mutable properties (not `let` reassignment) so state
  // persists across polls without local variable reassignment.
  const state = {
    runId: options.runId,
    consecutiveErrors: 0,
    firstTick: true,
    // Undefined until a resumable cursor is established (see `poll` and
    // `fetchWorkflowHistoryUpdates`); reset on continue-as-new since a new run's
    // cursor position is meaningless carried over from the old one.
    cursor: undefined as WorkflowHistoryCursor | undefined
  };
  const seen = new Map<string, SpanStatus>();
  // Assigned once per span id and never overwritten: `buildSpanLabels` numbers
  // same-named spans by how many are in the array *at call time*, so recomputing
  // it fresh every poll could retroactively change a label already printed to
  // the user (e.g. an unnumbered "Scrape Page" becoming "Scrape Page #1" once a
  // second instance appears). Freezing on first sight keeps printed labels stable.
  const labels = new Map<string, string>();

  // One emit point for both output formats: json mode wraps `fields` (plus
  // the ambient workflow/run id) as a line of NDJSON, text mode prints `text`.
  const emit = ( fields: Record<string, unknown>, text: string ): void => {
    io.log( json ?
      JSON.stringify( { workflowId: options.workflowId, runId: state.runId, ...fields } ) :
      text );
  };

  emit(
    { monitoring: true },
    `Monitoring ${options.workflowId}${state.runId ? ` (run ${state.runId})` : ''}... (Ctrl+C to detach)`
  );

  const sigintHandler = (): void => {
    emit( { detached: true }, '\nDetached (the workflow keeps running).' );
    process.exit( SIGINT_EXIT_CODE );
  };
  process.on( 'SIGINT', sigintHandler );

  try {
    while ( true ) {
      const outcome = await poll( options.workflowId, options, state, io );
      if ( outcome === null ) {
        state.consecutiveErrors += 1;
        await sleep( options.interval );
        continue;
      }
      state.consecutiveErrors = 0;
      state.firstTick = false;
      state.cursor = outcome.cursor;

      const result = outcome.result;
      state.runId = result.runId ?? state.runId;
      for ( const [ id, label ] of buildSpanLabels( result.spans ) ) {
        if ( !labels.has( id ) ) {
          labels.set( id, label );
        }
      }
      for ( const update of diffSpanUpdates( result.spans, labels, seen ) ) {
        emit( { span: update.span }, formatSpanUpdate( update, color ) );
      }

      const status = result.workflow?.status;

      if ( status === 'continued_as_new' ) {
        if ( !result.continuedAsNewRunId ) {
          io.error( 'Workflow continued as a new run, but the new run ID could not be determined.' );
        }
        emit(
          { continuedAsNewRunId: result.continuedAsNewRunId },
          formatContinuedAsNew( result.continuedAsNewRunId )
        );
        state.runId = result.continuedAsNewRunId;
        state.cursor = undefined;
        seen.clear();
        labels.clear();
        await sleep( options.interval );
        continue;
      }

      if ( status && TERMINAL_STATUSES.has( status ) ) {
        const summary = `${status === 'completed' ? '✓' : '✗'} workflow ${status} · ${formatDurationLabel( result.totalDurationMs )}`;
        emit( { status }, summary );
        if ( ERROR_STATUSES.has( status as WorkflowResultStatus ) ) {
          process.exitCode = 1;
        }
        return;
      }

      await sleep( options.interval );
    }
  } finally {
    process.removeListener( 'SIGINT', sigintHandler );
  }
}

/**
 * Shared `catch` handling for both entry points. A 400 is the generic status for
 * several distinct causes (invalid pageToken, a missing runId, an out-of-range
 * longPollTimeoutMs) — only override it with the stale-cursor message when the
 * server actually identifies that specific cause; otherwise let the real
 * validation error surface instead of misdiagnosing an unrelated 400.
 */
export function monitorErrorOverrides( error: Error ): Record<number, string> {
  const response = ( error as { response?: { status?: number; data?: { error?: string } } } ).response;
  const isStaleCursor = response?.status === 400 && response.data?.error === 'InvalidPageTokenError';

  const overrides: Record<number, string> = { 404: 'Workflow not found. Check the workflow ID.' };
  if ( isStaleCursor ) {
    overrides[400] = 'Resume cursor is no longer valid for this workflow; restart the monitor.';
  }
  return overrides;
}
