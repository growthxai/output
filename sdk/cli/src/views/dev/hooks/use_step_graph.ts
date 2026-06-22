import { useEffect, useRef, useState } from 'react';
import { fetchWorkflowHistory, type WorkflowMeta } from '#services/workflow_history.js';
import type { Span } from '#services/workflow_history/correlator.js';
import buildSpanLabels from '#utils/span_labels.js';
import { isTerminalRunStatus } from '#views/dev/hooks/use_run_detail.js';

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

const stepGraphCache = new Map<string, StepGraph>();

/**
 * Fetches a run's correlated step spans for the dev TUI's waterfall overlay,
 * reusing the same `fetchWorkflowHistory` path as the `workflow history` CLI
 * command. Mirrors `useRunDetail`: a stale-fetch guard, terminal-status caching,
 * and `status` in the dep array so a still-running run's bars finalise on the
 * 2s runs poll. Unlike `useRunDetail` (which tolerates partial traces), a hard
 * fetch failure is surfaced as `error` since the whole overlay is this fetch.
 */
export const useStepGraph = (
  workflowId: string | undefined,
  runId: string | undefined,
  status?: string
): StepGraph => {
  const [ graph, setGraph ] = useState<StepGraph>( EMPTY_GRAPH );
  const fetchIdRef = useRef( 0 );

  useEffect( () => {
    if ( !workflowId ) {
      setGraph( EMPTY_GRAPH );
      return;
    }

    const key = `${workflowId}:${runId ?? 'latest'}`;
    const cached = stepGraphCache.get( key );
    if ( cached ) {
      setGraph( cached );
      return;
    }

    const id = ++fetchIdRef.current;
    setGraph( { ...EMPTY_GRAPH, loading: true } );

    void fetchWorkflowHistory( { workflowId, runId } )
      .then( result => {
        if ( fetchIdRef.current !== id ) {
          return;
        }
        const next: StepGraph = {
          spans: result.spans,
          totalDurationMs: result.totalDurationMs,
          workflow: result.workflow,
          labels: buildSpanLabels( result.spans ),
          loading: false,
          error: null
        };
        // Only cache once the run has stopped advancing — a running run's
        // history is partial and the status-change refetch keeps it fresh.
        if ( isTerminalRunStatus( status ) ) {
          stepGraphCache.set( key, next );
        }
        setGraph( next );
      } )
      .catch( ( err: unknown ) => {
        if ( fetchIdRef.current !== id ) {
          return;
        }
        setGraph( { ...EMPTY_GRAPH, error: err instanceof Error ? err.message : String( err ) } );
      } );
  }, [ workflowId, runId, status ] );

  return graph;
};
