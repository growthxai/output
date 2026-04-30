import { useEffect, useRef, useState } from 'react';
import { readFile } from 'node:fs/promises';
import {
  getWorkflowIdResult,
  getWorkflowIdRunsRidResult,
  getWorkflowIdTraceLog,
  getWorkflowIdRunsRidTraceLog,
  type WorkflowResultResponse
} from '#api/generated/api.js';
import { HttpError } from '#api/http_client.js';
import { useUiState } from '#views/dev/state/ui_state.js';
import type { TraceData, DebugNode } from '#types/trace.js';

/**
 * 404 from `/result` and `/trace-log` is the API's normal "run hasn't
 * produced this yet" signal — every poll while a workflow is running hits
 * this. Anything else is a real error and should bubble to the caller so
 * the detail view can surface it (the run detail UI renders `error` from
 * the hook's return shape).
 */
const isExpectedMissingError = ( err: unknown ): boolean =>
  err instanceof HttpError && err.response.status === 404;

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
  error: string | null;
}

const EMPTY_DETAIL: RunDetail = {
  result: null,
  trace: null,
  steps: [],
  loading: false,
  error: null
};

const stepNameOf = ( node: DebugNode ): string => {
  if ( node.name ) {
    return node.name;
  }
  const kind = node.kind || node.type || 'step';
  const leaf = node.stepName ?? node.activityName ?? '?';
  return `${kind}#${leaf}`;
};

const stepStatusOf = ( node: DebugNode ): string => {
  if ( node.status ) {
    return node.status;
  }
  if ( node.phase === 'error' || node.error ) {
    return 'failed';
  }
  if ( node.phase === 'end' ) {
    return 'completed';
  }
  return 'running';
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

const fetchTrace = async ( workflowId: string, runId: string | undefined ): Promise<TraceData | null> => {
  try {
    const response = runId ?
      await getWorkflowIdRunsRidTraceLog( workflowId, runId ) :
      await getWorkflowIdTraceLog( workflowId );
    return await readTraceLog( response.data as Parameters<typeof readTraceLog>[0] );
  } catch ( err ) {
    if ( isExpectedMissingError( err ) ) {
      return null;
    }
    throw err;
  }
};

const fetchResult = async ( workflowId: string, runId: string | undefined ): Promise<WorkflowResultResponse | null> => {
  try {
    const response = runId ?
      await getWorkflowIdRunsRidResult( workflowId, runId ) :
      await getWorkflowIdResult( workflowId );
    return response.data as WorkflowResultResponse;
  } catch ( err ) {
    if ( isExpectedMissingError( err ) ) {
      return null;
    }
    throw err;
  }
};

/**
 * Statuses that mean the workflow has stopped advancing. The cache is
 * intentionally only populated for these — partial results from a still-
 * running workflow would otherwise stick and stall the UI when the run
 * eventually finishes.
 */
const TERMINAL_STATUSES = new Set( [ 'completed', 'failed', 'canceled', 'terminated', 'timed_out' ] );

export const isTerminalRunStatus = ( status: string | null | undefined ): boolean =>
  Boolean( status && TERMINAL_STATUSES.has( status ) );

export const useRunDetail = (
  workflowId: string | undefined,
  runId: string | undefined,
  status?: string
): RunDetail => {
  const ui = useUiState();
  const pushToast = ui.pushToast;
  const [ detail, setDetail ] = useState<RunDetail>( EMPTY_DETAIL );
  const cacheRef = useRef( new Map<string, RunDetail>() );
  const fetchIdRef = useRef( 0 );
  // Toast at most once per (workflowId, runId, error message). Without
  // this the 2s status poll re-fires the effect on every tick while the
  // backend is unhealthy and we'd stack a toast each time.
  const toastedRef = useRef( new Set<string>() );

  useEffect( () => {
    if ( !workflowId ) {
      setDetail( EMPTY_DETAIL );
      return;
    }

    // The cache only ever holds terminal-status entries (see below), so
    // a hit here is always safe to reuse without a network roundtrip.
    const key = `${workflowId}:${runId ?? 'latest'}`;
    const cached = cacheRef.current.get( key );
    if ( cached ) {
      setDetail( cached );
      return;
    }

    const id = ++fetchIdRef.current;
    setDetail( { ...EMPTY_DETAIL, loading: true } );

    Promise.all( [
      fetchResult( workflowId, runId ),
      fetchTrace( workflowId, runId )
    ] )
      .then( ( [ result, trace ] ) => {
        if ( fetchIdRef.current !== id ) {
          return;
        }
        const next: RunDetail = {
          result,
          trace,
          steps: extractSteps( trace ),
          loading: false,
          error: null
        };
        // Only memoize the result once the workflow is done. While it's
        // still running the API returns partial data; a follow-up status
        // change re-fires this effect and we re-fetch fresh.
        if ( isTerminalRunStatus( result?.status ) ) {
          cacheRef.current.set( key, next );
        }
        setDetail( next );
      } )
      .catch( err => {
        if ( fetchIdRef.current !== id ) {
          return;
        }
        const message = err instanceof Error ? err.message : String( err );
        const toastKey = `${key}:${message}`;
        if ( !toastedRef.current.has( toastKey ) ) {
          toastedRef.current.add( toastKey );
          pushToast( `Failed to load run detail — ${message}`, 'error' );
        }
        setDetail( { ...EMPTY_DETAIL, error: message } );
      } );
    // `status` is in the dep array so a run flipping running → completed
    // (the runs list polls every 2s) re-fires the effect and pulls the
    // fresh output, instead of pinning to the partial result captured
    // mid-run.
  }, [ workflowId, runId, status, pushToast ] );

  return detail;
};
