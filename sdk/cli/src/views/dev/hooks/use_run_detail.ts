import { useEffect, useRef, useState } from 'react';
import { readFile } from 'node:fs/promises';
import {
  getWorkflowIdResult,
  getWorkflowIdRunsRidResult,
  getWorkflowIdTraceLog,
  getWorkflowIdRunsRidTraceLog,
  type WorkflowResultResponse
} from '#api/generated/api.js';
import type { TraceData, DebugNode } from '#types/trace.js';
import { normalizeWorkflowStatus } from '#utils/normalize_workflow_status.js';
import { TERMINAL_STATUSES } from '#utils/format_workflow_result.js';

export interface RunStep {
  index: number;
  name: string;
  kind: string;
  status: string;
  durationMs: number;
  input: unknown;
  output: unknown;
  error: unknown;
}

export interface RunDetail {
  result: WorkflowResultResponse | null;
  trace: TraceData | null;
  steps: RunStep[];
  loading: boolean;
}

const EMPTY_DETAIL: RunDetail = {
  result: null,
  trace: null,
  steps: [],
  loading: false
};
const runDetailCache = new Map<string, RunDetail>();

const stepNameOf = ( node: DebugNode ): string => {
  if ( node.name ) {
    return node.name;
  }
  const kind = node.kind || node.type || 'step';
  const leaf = node.stepName ?? node.activityName ?? '?';
  return `${kind}#${leaf}`;
};

const stepStatusOf = ( node: DebugNode ): string => {
  if ( node.phase === 'error' || node.error || node.status === 'failed' ) {
    return 'failed';
  }
  if ( node.phase === 'end' || node.status === 'completed' || node.endedAt !== undefined ) {
    return 'completed';
  }
  return node.status ?? 'running';
};

const numericTimestamp = ( ...candidates: Array<unknown> ): number | null => {
  for ( const candidate of candidates ) {
    if ( typeof candidate === 'number' ) {
      return candidate;
    }
  }
  return null;
};

const stepDurationOf = ( node: DebugNode ): number => {
  if ( typeof node.duration === 'number' ) {
    return node.duration;
  }
  const start = numericTimestamp( node.startTime, node.startedAt );
  const end = numericTimestamp( node.endTime, node.endedAt );
  if ( start !== null && end !== null ) {
    return end - start;
  }
  return 0;
};

export const extractSteps = ( trace: TraceData | null ): RunStep[] => {
  if ( !trace?.children ) {
    return [];
  }
  return trace.children
    .filter( node => node.phase !== 'start' )
    .map( ( node, idx ) => ( {
      index: idx + 1,
      name: stepNameOf( node ),
      kind: node.kind || node.type || 'step',
      status: stepStatusOf( node ),
      durationMs: stepDurationOf( node ),
      input: node.input ?? ( node.details?.input as unknown ),
      output: node.output ?? ( node.details?.output as unknown ),
      error: node.error
    } ) );
};

const readTraceLog = async (
  source: { source: 'remote'; data: unknown } | { source: 'local'; localPath: string }
): Promise<TraceData | null> => {
  if ( source.source === 'remote' ) {
    return source.data as TraceData;
  }
  const content = await readFile( source.localPath, 'utf-8' );
  return JSON.parse( content ) as TraceData;
};

// Run detail and trace fetches are best-effort. Many statuses (in-progress,
// failed, canceled) don't have a fully-formed result or trace available at
// any given moment, and that's expected — the caller falls back to
// EMPTY_DETAIL and the UI renders whatever's there. Swallow everything.
const fetchTrace = async ( workflowId: string, runId: string | undefined ): Promise<TraceData | null> => {
  try {
    const response = runId ?
      await getWorkflowIdRunsRidTraceLog( workflowId, runId ) :
      await getWorkflowIdTraceLog( workflowId );
    return await readTraceLog( response.data as Parameters<typeof readTraceLog>[0] );
  } catch {
    return null;
  }
};

const fetchResult = async ( workflowId: string, runId: string | undefined ): Promise<WorkflowResultResponse | null> => {
  try {
    const response = runId ?
      await getWorkflowIdRunsRidResult( workflowId, runId ) :
      await getWorkflowIdResult( workflowId );
    const data = response.data as WorkflowResultResponse;
    return {
      ...data,
      status: normalizeWorkflowStatus( data.status )
    } as WorkflowResultResponse;
  } catch {
    return null;
  }
};

// The cache is intentionally only populated for terminal statuses — partial results
// from a still-running workflow would otherwise stick and stall the UI when the run
// eventually finishes. `TERMINAL_STATUSES` is shared with `workflow monitor`.
export const isTerminalRunStatus = ( status: string | null | undefined ): boolean =>
  Boolean( status && TERMINAL_STATUSES.has( status ) );

export const useRunDetail = (
  workflowId: string | undefined,
  runId: string | undefined,
  status?: string
): RunDetail => {
  const [ detail, setDetail ] = useState<RunDetail>( EMPTY_DETAIL );
  const fetchIdRef = useRef( 0 );

  useEffect( () => {
    if ( !workflowId ) {
      setDetail( EMPTY_DETAIL );
      return;
    }

    // The cache only ever holds terminal-status entries (see below), so
    // a hit here is always safe to reuse without a network roundtrip.
    const key = `${workflowId}:${runId ?? 'latest'}`;
    const cached = runDetailCache.get( key );
    if ( cached ) {
      setDetail( cached );
      return;
    }

    const id = ++fetchIdRef.current;
    setDetail( { ...EMPTY_DETAIL, loading: true } );

    void Promise.all( [
      fetchResult( workflowId, runId ),
      fetchTrace( workflowId, runId )
    ] ).then( ( [ result, trace ] ) => {
      if ( fetchIdRef.current !== id ) {
        return;
      }
      const next: RunDetail = {
        result,
        trace,
        steps: extractSteps( trace ),
        loading: false
      };
      // Only memoize the result once the workflow is done. While it's
      // still running the API returns partial data; a follow-up status
      // change re-fires this effect and we re-fetch fresh.
      if ( isTerminalRunStatus( result?.status ) ) {
        runDetailCache.set( key, next );
      }
      setDetail( next );
    } );
    // `status` is in the dep array so a run flipping running → completed
    // (the runs list polls every 2s) re-fires the effect and pulls the
    // fresh output, instead of pinning to the partial result captured
    // mid-run.
  }, [ workflowId, runId, status ] );

  return detail;
};
