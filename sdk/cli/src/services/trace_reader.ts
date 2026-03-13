import { readFile } from 'node:fs/promises';
import { getWorkflowIdTraceLog } from '#api/generated/api.js';
import { getErrorCode } from '#utils/error_utils.js';
import type { TraceData } from '#types/trace.js';

export type { TraceData };

export interface TraceLocation {
  path: string;
  isRemote: boolean;
}

export interface TraceResult {
  data: TraceData;
  location: TraceLocation;
}

/**
 * Read and parse trace file from local path
 */
async function readLocalTraceFile( path: string ): Promise<TraceData> {
  try {
    const content = await readFile( path, 'utf-8' );
    return JSON.parse( content );
  } catch ( error ) {
    if ( getErrorCode( error ) === 'ENOENT' ) {
      throw new Error( `Trace file not found at path: ${path}` );
    }
    if ( error instanceof SyntaxError ) {
      throw new Error( `Invalid JSON in trace file: ${path}` );
    }
    throw error;
  }
}

/**
 * Get trace data from workflow ID using the API
 * The API handles S3 fetching - CLI only needs to read local files when necessary
 * @returns Both the trace data and the location it was fetched from
 */
export async function getTrace( workflowId: string ): Promise<TraceResult> {
  const response = await getWorkflowIdTraceLog( workflowId );

  if ( response.status === 404 ) {
    throw new Error( `Workflow not found or no trace available: ${workflowId}` );
  }

  if ( response.status === 500 ) {
    const errorData = response.data as { error?: string };
    const errorMessage = errorData?.error || 'Failed to fetch trace from API';
    throw new Error( `API error (500): ${errorMessage}` );
  }

  if ( response.status !== 200 ) {
    const errorResponse = response as { status: number };
    throw new Error( `Unexpected API response status: ${errorResponse.status}` );
  }

  const data = response.data;

  if ( data.source === 'remote' ) {
    return {
      data: data.data as unknown as TraceData,
      location: { path: 'remote', isRemote: true }
    };
  }

  if ( data.source === 'local' ) {
    const localPath = data.localPath;
    const traceData = await readLocalTraceFile( localPath );
    return {
      data: traceData,
      location: { path: localPath, isRemote: false }
    };
  }

  throw new Error( 'Invalid trace log response format' );
}
