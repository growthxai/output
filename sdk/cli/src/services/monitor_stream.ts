import {
  fetchWorkflowHistory, fetchWorkflowHistoryUpdates,
  type WorkflowHistoryCursor, type WorkflowHistoryResult
} from '#services/workflow_history.js';
import type { SpanStatus } from '#services/workflow_history/correlator.js';
import buildSpanLabels from '#utils/span_labels.js';
import { formatDurationLabel } from '#utils/waterfall.js';
import { diffSpanUpdates, formatContinuedAsNew, formatSpanUpdate } from '#utils/monitor_log.js';
import { isErrorStatus, isTerminalStatus, type TerminalStatus } from '#utils/format_workflow_result.js';
import { getErrorMessage } from '#utils/error_utils.js';
import { sleep } from '#utils/sleep.js';
import { shouldColorize } from '#utils/color.js';
import { HttpError } from '#api/http_client.js';

const MAX_CONSECUTIVE_ERRORS = 5;
/**
 * Retry sleep ceiling while no poll has succeeded yet. The retry budget covers
 * the first poll for `start --monitor`'s sake (see `poll`), but `workflow
 * monitor wf-x` against a server that was never reachable pays for that too —
 * and with a large `--interval` it would sit through the whole budget before
 * reporting a connection it could never make. Capping only the pre-first-success
 * sleep keeps the retry useful without making "the API is down" take minutes to
 * surface; once a poll has succeeded, the user's `--interval` is honored.
 */
const UNESTABLISHED_RETRY_MS = 1000;
const SIGINT_EXIT_CODE = 130;
const FLUSH_TIMEOUT_MS = 2000;
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
 * Adapts an oclif command to the above. Late-bound arrows rather than
 * `command.log.bind( command )`: oclif (and the unit tests) replace these as own
 * properties on the instance, so they must resolve at call time. Structurally
 * typed so a test double satisfies it without a real oclif `Config`.
 */
export function commandStreamIo( command: {
  log: ( message: string ) => void;
  warn: ( message: string ) => unknown;
  error: ( message: string, options: { exit: number } ) => never;
} ): MonitorStreamIo {
  return {
    log: message => command.log( message ),
    warn: message => {
      command.warn( message );
    },
    error: message => command.error( message, { exit: 1 } )
  };
}

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
 * Wraps a single poll: a transient blip (see `isTransientPollError`) returns
 * `null` so the loop can retry — matching the dev TUI's `useStepGraph` behavior
 * of keeping the last good state on a poll hiccup. A non-transient error (e.g. a
 * 404 for a mistyped workflow id, a stale resume cursor, or a bug in the parsing
 * pipeline) rethrows immediately since retrying it cannot succeed.
 * `MAX_CONSECUTIVE_ERRORS` bounds how long we'll retry transient failures before
 * giving up.
 *
 * The retry budget deliberately covers the *first* poll too. `workflow start
 * --monitor` issues it milliseconds after the API accepted the start request, so
 * the first poll is the one most likely to catch a rolling restart or a single
 * 503 — and aborting there abandons a workflow that is already running. The
 * sleep between those pre-first-success retries is capped so `workflow monitor`
 * against an unreachable server doesn't pay the full budget at `--interval`
 * (see `UNESTABLISHED_RETRY_MS`).
 *
 * Fetch strategy is driven by `state.cursor`, not tick count: no cursor yet
 * (the very first poll, or the first poll of a run chained via continue-as-new)
 * uses `fetchWorkflowHistory` (fast, no long-poll) so that render isn't delayed;
 * once a cursor exists, every poll resumes via `fetchWorkflowHistoryUpdates`
 * instead of re-paging the whole history — see `plan_workflow_monitor_history.md`
 * for why a full re-fetch every tick is expensive for long-running workflows.
 */
async function poll(
  options: { workflowId: string; includePayloads: boolean; interval: number },
  state: {
    runId: string | undefined;
    consecutiveErrors: number;
    cursor: WorkflowHistoryCursor | undefined;
    detached: boolean;
  },
  io: MonitorStreamIo
): Promise<{ result: WorkflowHistoryResult; cursor: WorkflowHistoryCursor } | null> {
  try {
    // Keeps the resumed long-poll's server-side block roughly aligned with `--interval`
    // instead of always blocking for the server's full configured deadline regardless of
    // it (see `plan_workflow_monitor_history.md`'s "Known tradeoff" note). Only takes
    // effect once resuming (i.e. from the second tick onward); `fetchWorkflowHistory`
    // ignores it on the initial full walk.
    const fetchOptions = {
      workflowId: options.workflowId,
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
    // Whatever this poll was doing stopped mattering the moment the user
    // detached: reporting a retry would contradict the "Detached" line already
    // printed, and rethrowing would unwind past the loop's own detach guards
    // into the caller's "monitoring stopped" handling, racing exit 3 against the
    // 130 the detach already recorded. The loop breaks on `detached` right after
    // this returns, so `null` here is not a retry.
    if ( state.detached ) {
      return null;
    }
    if ( !isTransientPollError( error ) || state.consecutiveErrors + 1 >= MAX_CONSECUTIVE_ERRORS ) {
      throw error;
    }
    io.warn( `Poll failed (${state.consecutiveErrors + 1}/${MAX_CONSECUTIVE_ERRORS}), retrying: ${getErrorMessage( error )}` );
    return null;
  }
}

/**
 * `process.exit` discards whatever is still queued on an asynchronous stdout —
 * a pipe on macOS, where writes are buffered rather than synchronous (TTY and
 * file writes are synchronous on POSIX and are not truncated). Detaching from
 * `workflow start --monitor` that way can drop the `Workflow ID:` line the
 * command printed moments earlier, leaving the user with no way to reattach to a
 * workflow that is still running. So queue an empty write behind the pending
 * output and exit once it drains, with a ceiling in case the reader has stalled.
 */
function exitAfterFlush( code: number ): void {
  const state = { exited: false };
  const exit = (): void => {
    if ( state.exited ) {
      return;
    }
    state.exited = true;
    process.exit( code );
  };
  const timer = setTimeout( exit, FLUSH_TIMEOUT_MS );
  process.stdout.write( '', () => {
    clearTimeout( timer );
    exit();
  } );
}

/**
 * Polls a workflow run and emits status updates until it reaches a terminal
 * state, following continue-as-new chains. Shared by `workflow monitor` and
 * `workflow start --monitor` so both behave identically; see `MonitorStreamIo`
 * for why output is injected rather than taken from a `Command`.
 *
 * Sets `process.exitCode = 1` on a terminal error status rather than throwing,
 * so the caller's own output (e.g. `start`'s "Workflow started successfully")
 * is still the command's primary result. Returns the terminal status it stopped
 * on — `undefined` if it stopped because the user detached — so a caller can
 * tailor its own follow-up (`workflow result` vs `workflow debug`).
 */
export async function streamWorkflowUpdates(
  options: MonitorStreamOptions,
  io: MonitorStreamIo
): Promise<TerminalStatus | undefined> {
  const color = shouldColorize( options.color );

  // Threaded via mutable properties (not `let` reassignment) so state
  // persists across polls without local variable reassignment.
  const state = {
    runId: options.runId,
    consecutiveErrors: 0,
    // Set by the SIGINT handler so an in-flight poll can't print another update
    // on top of "Detached" while stdout drains (see `exitAfterFlush`).
    detached: false,
    terminalStatus: undefined as TerminalStatus | undefined,
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
    io.log( options.json ?
      JSON.stringify( { workflowId: options.workflowId, runId: state.runId, ...fields } ) :
      text );
  };

  emit(
    { monitoring: true },
    `Monitoring ${options.workflowId}${state.runId ? ` (run ${state.runId})` : ''}... (Ctrl+C to detach)`
  );

  const sigintHandler = (): void => {
    // The listener stays registered until the loop unwinds through `finally`, and
    // the exit is deferred behind a stdout flush — so an impatient second Ctrl+C
    // lands here again and would print a second "Detached" line and schedule a
    // second exit.
    if ( state.detached ) {
      return;
    }
    state.detached = true;
    // Recorded as well as exited with: deferring the exit for a stdout flush
    // lets the loop unwind and the command return normally in the meantime, and
    // whichever of the two finishes first has to land on 130.
    process.exitCode = SIGINT_EXIT_CODE;
    emit(
      { detached: true },
      `\nDetached (the workflow keeps running). Use "workflow status ${options.workflowId}" to check on it, ` +
      `or "workflow result ${options.workflowId}" once it finishes.`
    );
    exitAfterFlush( SIGINT_EXIT_CODE );
  };
  process.on( 'SIGINT', sigintHandler );

  try {
    while ( true ) {
      if ( state.detached ) {
        break;
      }
      const outcome = await poll( options, state, io );
      if ( state.detached ) {
        break;
      }
      if ( outcome === null ) {
        state.consecutiveErrors += 1;
        await sleep( state.cursor ? options.interval : Math.min( options.interval, UNESTABLISHED_RETRY_MS ) );
        continue;
      }
      state.consecutiveErrors = 0;
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
          // `io.error` is typed `never`, but nothing enforces that at runtime.
          // Without this, an `io` whose `error` returns would fall through to
          // re-poll the latest run with the cursor cleared — replaying the whole
          // span history every interval, forever, with a zero exit code.
          break;
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

      if ( isTerminalStatus( status ) ) {
        const failed = isErrorStatus( status );
        emit(
          { status },
          `${failed ? '✗' : '✓'} workflow ${status} · ${formatDurationLabel( result.totalDurationMs )}`
        );
        if ( failed ) {
          process.exitCode = 1;
        }
        state.terminalStatus = status;
        break;
      }

      await sleep( options.interval );
    }
  } finally {
    process.removeListener( 'SIGINT', sigintHandler );
  }

  return state.terminalStatus;
}

/**
 * Shared `catch` handling for both entry points. A 400 is the generic status for
 * several distinct causes (invalid pageToken, a missing runId, an out-of-range
 * longPollTimeoutMs) — only override it with the stale-cursor message when the
 * server actually identifies that specific cause; otherwise let the real
 * validation error surface instead of misdiagnosing an unrelated 400.
 *
 * Deliberately no 404 here: "check the workflow ID" only reads correctly where
 * the user typed the id, so `workflow monitor` adds it and `start --monitor`
 * doesn't — there the id came back from `postWorkflowStart`, and the server's own
 * message is left to surface inside the "started, but monitoring stopped" wrapper
 * instead of advising a fix that isn't the user's to make.
 */
export function monitorErrorOverrides( error: Error ): Record<number, string> {
  const response = ( error as { response?: { status?: number; data?: { error?: string } } } ).response;
  const isStaleCursor = response?.status === 400 && response.data?.error === 'InvalidPageTokenError';

  return isStaleCursor ?
    { 400: 'Resume cursor is no longer valid for this workflow; restart the monitor.' } :
    {};
}
