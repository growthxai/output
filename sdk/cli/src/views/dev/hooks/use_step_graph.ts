import { useRef, useState } from 'react';
import { fetchWorkflowHistory, type WorkflowMeta } from '#services/workflow_history.js';
import type { Span } from '#services/workflow_history/correlator.js';
import buildSpanLabels from '#utils/span_labels.js';
import { isTerminalRunStatus } from '#views/dev/hooks/use_run_detail.js';
import { usePoll, POLL_INTERVAL_MS } from '#views/dev/hooks/use_poll.js';
import { createBoundedCache } from '#views/dev/utils/bounded_cache.js';

export interface StepGraph {
  spans: Span[];
  totalDurationMs: number;
  workflow: WorkflowMeta | null;
  labels: Map<string, string>;
  loading: boolean;
  error: string | null;
}

const EMPTY_GRAPH: StepGraph = {
  spans: [],
  totalDurationMs: 0,
  workflow: null,
  labels: new Map(),
  loading: false,
  error: null
};

const STEP_GRAPH_CACHE_MAX = 50;
const stepGraphCache = createBoundedCache<string, StepGraph>( STEP_GRAPH_CACHE_MAX );

/**
 * Fetches a run's correlated step spans for the dev TUI's waterfall overlay,
 * reusing the same `fetchWorkflowHistory` path as the `workflow history` CLI
 * command. Driven by `usePoll`: while the run is still advancing it re-pulls
 * every tick so newly scheduled / finished steps appear, then stops and caches
 * once terminal. The modal ticks the time axis between polls so the right edge
 * tracks elapsed time.
 *
 * A hard fetch failure surfaces as `error` only when nothing has loaded yet — a
 * transient poll blip keeps the last good chart on screen.
 */
export const useStepGraph = (
  workflowId: string | undefined,
  runId: string | undefined,
  status?: string
): StepGraph => {
  const [ graph, setGraph ] = useState<StepGraph>( EMPTY_GRAPH );
  const terminal = isTerminalRunStatus( status );
  const requestKeyRef = useRef( '' );

  usePoll( Boolean( workflowId ), POLL_INTERVAL_MS, async () => {
    if ( !workflowId ) {
      return 'done';
    }

    const key = `${workflowId}:${runId ?? 'latest'}`;
    requestKeyRef.current = key;

    const cached = stepGraphCache.get( key );
    if ( cached ) {
      setGraph( cached );
      return 'done';
    }

    setGraph( current => ( current.spans.length === 0 ? { ...current, loading: true } : current ) );
    try {
      // Pull payloads so the detail pane can show each step's input/output and
      // a failed step's reason.
      const result = await fetchWorkflowHistory( { workflowId, runId, includePayloads: true } );
      if ( requestKeyRef.current !== key ) {
        return 'done'; // a different run was selected mid-flight
      }
      const next: StepGraph = {
        spans: result.spans,
        totalDurationMs: result.totalDurationMs,
        workflow: result.workflow,
        labels: buildSpanLabels( result.spans ),
        loading: false,
        error: null
      };
      // Cache only terminal runs — a running run's history is still growing.
      if ( terminal ) {
        stepGraphCache.set( key, next );
      }
      setGraph( next );
    } catch ( err: unknown ) {
      if ( requestKeyRef.current !== key ) {
        return 'done';
      }
      const message = err instanceof Error ? err.message : String( err );
      // Keep the last good chart if a poll blips; only surface a cold failure.
      setGraph( current => ( current.spans.length > 0 ?
        { ...current, loading: false } :
        { ...EMPTY_GRAPH, error: message } ) );
    }

    return terminal ? 'done' : 'continue';
  } );

  return graph;
};
