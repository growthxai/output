/**
 * Fetches a workflow run's full Temporal history from the API and correlates the
 * flat event stream into spans (one per step) the CLI can render as a waterfall.
 *
 * Pages through `GET /workflow/{id}/history` (mirroring Atlas's
 * OutputWorkflows::WorkflowHistory): the first page carries the workflow
 * metadata and resolves the run ID; subsequent pages echo that run ID alongside
 * the `nextPageToken` (the endpoint requires runId once a pageToken is used).
 */
import { getWorkflowIdHistory, type GetWorkflowIdHistory200 } from '#api/generated/api.js';
import { correlate, eventAttributes, eventTypeName, type HistoryEvent, type Span } from '#services/workflow_history/correlator.js';
import { normalizeWorkflowStatus } from '#utils/normalize_workflow_status.js';

const PAGE_SIZE = 50;

export interface WorkflowMeta {
  workflowId?: string;
  runId?: string;
  status?: string;
  startTime?: string;
  closeTime?: string | null;
  historyLength?: number;
  taskQueue?: string;
}

export interface FetchWorkflowHistoryOptions {
  workflowId: string;
  runId?: string;
  includePayloads?: boolean;
}

export interface WorkflowHistoryResult {
  workflow: WorkflowMeta | null;
  // The server's response before status normalization, for callers (e.g. `history
  // --raw`) that promise a verbatim passthrough of the API response rather than
  // the client-side status vocabulary `workflow.status` is normalized into.
  rawWorkflow: WorkflowMeta | null;
  runId: string | null;
  events: HistoryEvent[];
  spans: Span[];
  totalDurationMs: number;
  continuedAsNewRunId: string | null;
  // Resume state for a follow-up `fetchWorkflowHistoryUpdates` call — populated by every
  // fetch (not just the incremental path), so a poller can resume from *any* prior call,
  // including the very first one, instead of re-paging from page 1 on its second call.
  cursor: WorkflowHistoryCursor;
}

/**
 * Resume state for `fetchWorkflowHistoryUpdates`: the accumulated events (so spans/duration
 * are always computed over the full history, not just the latest delta), `lastEventId` for
 * de-duping a replayed page, and `pageToken` — the position that fetched the *current* end of
 * history, which is itself always a valid resume point (see `fetchPages`) even though the
 * server's own `nextPageToken` for that position is empty.
 */
export interface WorkflowHistoryCursor {
  pageToken: string | undefined;
  lastEventId: number;
  meta: WorkflowMeta | null;
  runId: string | undefined;
  events: HistoryEvent[];
}

function numericEventId( event: HistoryEvent ): number {
  const id = Number( ( event as { eventId?: unknown } ).eventId );
  return Number.isFinite( id ) ? id : 0;
}

function toMs( value: string | null | undefined ): number | null {
  if ( !value ) {
    return null;
  }
  const ms = Date.parse( String( value ) );
  return Number.isNaN( ms ) ? null : ms;
}

function earliestEventMs( events: HistoryEvent[] ): number | null {
  const times = events
    .map( e => toMs( e.eventTime as string | undefined ) )
    .filter( ( ms ): ms is number => ms !== null );
  return times.length > 0 ? Math.min( ...times ) : null;
}

// Timeline origin (0 offset): the workflow's start time, falling back to the
// WORKFLOW_EXECUTION_STARTED event, then the earliest event seen.
function workflowStartMs( meta: WorkflowMeta | null, events: HistoryEvent[] ): number | null {
  const fromMeta = toMs( meta?.startTime );
  if ( fromMeta !== null ) {
    return fromMeta;
  }
  const started = events.find( e => e.eventTypeName === 'WORKFLOW_EXECUTION_STARTED' );
  const fromStarted = toMs( started?.eventTime as string | undefined );
  if ( fromStarted !== null ) {
    return fromStarted;
  }
  return earliestEventMs( events );
}

// The paginated history endpoint doesn't surface a resolved `newRunId` the way
// the SSE stream endpoint does (see `stream_history.js`'s `doneChunk`), so pull
// it directly off the WORKFLOW_EXECUTION_CONTINUED_AS_NEW event when present.
function continuedAsNewRunId( events: HistoryEvent[] ): string | null {
  const terminal = events.find( e => eventTypeName( e ) === 'WORKFLOW_EXECUTION_CONTINUED_AS_NEW' );
  return ( eventAttributes( terminal )?.newExecutionRunId as string | undefined ) ?? null;
}

function totalDuration( meta: WorkflowMeta | null, spans: Span[], startMs: number | null ): number {
  const closeMs = toMs( meta?.closeTime ?? undefined );
  if ( closeMs !== null && startMs !== null && ( closeMs - startMs ) > 0 ) {
    return closeMs - startMs;
  }
  const maxEnd = spans.reduce( ( max, span ) => Math.max( max, span.endOffsetMs ), 0 );
  return Math.max( maxEnd, 1 );
}

/**
 * Pages through history starting from `acc` (its `pageToken`/`lastEventId`/`events` carry
 * the resume position — pass a zeroed cursor for a fresh walk). With `wait` set, every
 * request asks the server to long-poll (`waitNewEvent`) rather than return immediately, so
 * the final hop blocks (bounded server-side) until either a new event exists or the deadline
 * elapses. `lastEventId` de-dupes: resuming from a previously-seen page token replays that
 * page's events, which are filtered out here rather than appended twice.
 */
async function fetchPages( workflowId: string, includePayloads: boolean, wait: boolean, acc: WorkflowHistoryCursor ): Promise<WorkflowHistoryCursor> {
  const { pageToken, runId } = acc;
  const response = await getWorkflowIdHistory( workflowId, {
    runId, pageSize: PAGE_SIZE, pageToken, includePayloads,
    ...( wait ? { wait: true } : {} )
  } );
  if ( !response.data ) {
    throw new Error( 'API returned invalid response (missing data)' );
  }

  const data = response.data as GetWorkflowIdHistory200;
  // The generated `data.workflow` is an opaque `{ [key: string]: unknown }`, so
  // narrow it to WorkflowMeta via `unknown` (its real fields are validated by
  // the server, mirroring Atlas's metadata shape). Prefer the *fresh* value when the
  // server sent one — it re-describes on every `wait` call specifically so status
  // updates (e.g. running -> completed) are seen; falling back to `acc.meta` only
  // covers the pages within a walk where the server didn't re-describe.
  const meta = ( data.workflow as unknown as WorkflowMeta | null ) ?? acc.meta;
  const resolvedRunId = runId ?? data.runId ?? acc.runId;
  const pageEvents = ( data.events as HistoryEvent[] | undefined ) ?? [];
  const newEvents = pageEvents.filter( event => numericEventId( event ) > acc.lastEventId );
  const events = [ ...acc.events, ...newEvents ];
  // Events arrive in increasing eventId order, so the last new one is the max — no scan needed.
  const lastEventId = newEvents.length > 0 ? numericEventId( newEvents[newEvents.length - 1] ) : acc.lastEventId;
  const nextToken = data.nextPageToken ?? undefined;
  const nextAcc: WorkflowHistoryCursor = { meta, runId: resolvedRunId, events, lastEventId, pageToken: nextToken ?? pageToken };

  // While long-polling, stop and hand back the first batch of new events instead of
  // draining further pages — a poller needs each transition rendered as it arrives, not
  // several (possibly including a terminal one) silently merged into a single response
  // after however long it took to walk to the current tip.
  if ( wait && newEvents.length > 0 ) {
    return nextAcc;
  }

  // The server echoes `pageToken` back unchanged (see `get_history.js`) when a waitNewEvent
  // call's deadline elapses with nothing new — that's the tip, stop for this tick.
  const timedOut = wait && nextToken === pageToken;
  if ( timedOut ) {
    return nextAcc;
  }
  if ( nextToken ) {
    return fetchPages( workflowId, includePayloads, wait, nextAcc );
  }
  // Drained: the server has nothing more buffered (`nextToken` is empty), but unlike
  // `nextToken`, `pageToken` — the position that fetched this now-empty page — is still a
  // valid resume point: a future waitNewEvent call from here replays this page (de-duped by
  // `lastEventId`) and then genuinely waits at the tip, instead of restarting from page 1.
  return nextAcc;
}

function buildResult( pages: WorkflowHistoryCursor ): WorkflowHistoryResult {
  const { meta: rawMeta, runId: resolvedRunId, events } = pages;
  // Normalize once here so every consumer (monitor, history, etc.) sees the
  // same status vocabulary, matching status.ts/workflow_runs.ts/etc.
  const status = normalizeWorkflowStatus( rawMeta?.status );
  const meta = rawMeta ? { ...rawMeta, status } : rawMeta;

  const startMs = workflowStartMs( meta, events );
  const spans = correlate( events, startMs );

  return {
    workflow: meta,
    rawWorkflow: rawMeta,
    runId: resolvedRunId ?? meta?.runId ?? null,
    events,
    spans,
    totalDurationMs: totalDuration( meta, spans, startMs ),
    continuedAsNewRunId: continuedAsNewRunId( events ),
    cursor: pages
  };
}

export async function fetchWorkflowHistory( options: FetchWorkflowHistoryOptions ): Promise<WorkflowHistoryResult> {
  const { workflowId, runId, includePayloads = false } = options;

  const pages = await fetchPages(
    workflowId, includePayloads, false, { meta: null, runId, events: [], lastEventId: 0, pageToken: undefined }
  );

  return buildResult( pages );
}

/**
 * Incremental counterpart to `fetchWorkflowHistory`, for a poller (`workflow monitor`) that
 * calls repeatedly while a workflow is still running. Pass the previous call's `cursor`
 * (from either function's result) to resume from where it left off instead of re-paging the
 * whole history; omit it only to start a completely fresh walk.
 */
export async function fetchWorkflowHistoryUpdates(
  options: FetchWorkflowHistoryOptions,
  cursor?: WorkflowHistoryCursor
): Promise<{ result: WorkflowHistoryResult; cursor: WorkflowHistoryCursor }> {
  const { workflowId, includePayloads = false } = options;
  const seed: WorkflowHistoryCursor = cursor ??
    { meta: null, runId: options.runId, events: [], lastEventId: 0, pageToken: undefined };

  const pages = await fetchPages( workflowId, includePayloads, true, seed );

  return { result: buildResult( pages ), cursor: pages };
}
