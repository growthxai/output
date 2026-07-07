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
  runId: string | null;
  events: HistoryEvent[];
  spans: Span[];
  totalDurationMs: number;
  continuedAsNewRunId: string | null;
}

interface PageAccumulator {
  meta: WorkflowMeta | null;
  runId: string | undefined;
  events: HistoryEvent[];
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

async function fetchAllPages(
  workflowId: string,
  includePayloads: boolean,
  runId: string | undefined,
  pageToken: string | undefined,
  acc: PageAccumulator
): Promise<PageAccumulator> {
  const response = await getWorkflowIdHistory( workflowId, { runId, pageSize: PAGE_SIZE, pageToken, includePayloads } );
  if ( !response.data ) {
    throw new Error( 'API returned invalid response (missing data)' );
  }

  const data = response.data as GetWorkflowIdHistory200;
  // The generated `data.workflow` is an opaque `{ [key: string]: unknown }`, so
  // narrow it to WorkflowMeta via `unknown` (its real fields are validated by
  // the server, mirroring Atlas's metadata shape).
  const meta = acc.meta ?? ( data.workflow as unknown as WorkflowMeta | null ) ?? null;
  const resolvedRunId = runId ?? data.runId ?? acc.runId;
  const events = [ ...acc.events, ...( ( data.events as HistoryEvent[] | undefined ) ?? [] ) ];
  const nextToken = data.nextPageToken ?? undefined;
  const nextAcc: PageAccumulator = { meta, runId: resolvedRunId, events };

  if ( nextToken ) {
    return fetchAllPages( workflowId, includePayloads, resolvedRunId, nextToken, nextAcc );
  }
  return nextAcc;
}

export async function fetchWorkflowHistory( options: FetchWorkflowHistoryOptions ): Promise<WorkflowHistoryResult> {
  const { workflowId, runId, includePayloads = false } = options;

  const { meta, runId: resolvedRunId, events } = await fetchAllPages(
    workflowId, includePayloads, runId, undefined, { meta: null, runId, events: [] }
  );

  const startMs = workflowStartMs( meta, events );
  const spans = correlate( events, startMs );

  return {
    workflow: meta,
    runId: resolvedRunId ?? meta?.runId ?? null,
    events,
    spans,
    totalDurationMs: totalDuration( meta, spans, startMs ),
    // Only the common case (a workflow that continued as new) pays for the
    // scan; every other status skips it entirely.
    continuedAsNewRunId: meta?.status === 'continued_as_new' ? continuedAsNewRunId( events ) : null
  };
}
