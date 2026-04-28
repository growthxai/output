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
    if ( response.status !== 200 ) {
      return null;
    }
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
    if ( response.status !== 200 ) {
      return null;
    }
    return response.data as WorkflowResultResponse;
  } catch {
    return null;
  }
};

export const useRunDetail = ( workflowId: string | undefined, runId: string | undefined ): RunDetail => {
  const [ detail, setDetail ] = useState<RunDetail>( EMPTY_DETAIL );
  const cacheRef = useRef( new Map<string, RunDetail>() );
  const fetchIdRef = useRef( 0 );

  useEffect( () => {
    if ( !workflowId ) {
      setDetail( EMPTY_DETAIL );
      return;
    }

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
        cacheRef.current.set( key, next );
        setDetail( next );
      } )
      .catch( err => {
        if ( fetchIdRef.current !== id ) {
          return;
        }
        setDetail( {
          ...EMPTY_DETAIL,
          error: err instanceof Error ? err.message : String( err )
        } );
      } );
  }, [ workflowId, runId ] );

  return detail;
};
