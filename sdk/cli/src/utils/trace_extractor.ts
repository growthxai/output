export interface ExtractedDataset {
  input: Record<string, unknown>;
  output: unknown;
  executionTimeMs?: number;
}

interface TraceFile {
  input?: unknown;
  output?: unknown;
  startedAt?: number;
  endedAt?: number;
  duration?: number;
  root?: { startTime?: number; endTime?: number; duration?: number };
  events?: Array<{ phase: string; details?: unknown }>;
  children?: Array<{ input?: unknown; output?: unknown }>;
}

function isRecord( value: unknown ): value is Record<string, unknown> {
  return value !== null && value !== undefined && typeof value === 'object';
}

function unwrapOutput( output: unknown ): unknown {
  if ( isRecord( output ) && 'output' in output && 'trace' in output ) {
    return output.output;
  }
  return output;
}

function findInput( trace: TraceFile ): Record<string, unknown> | undefined {
  if ( isRecord( trace.input ) ) {
    return trace.input;
  }

  const startEvent = trace.events?.find( e => e.phase === 'start' );
  const eventInput = ( startEvent?.details as Record<string, unknown> | undefined )?.input;
  if ( isRecord( eventInput ) ) {
    return eventInput;
  }

  const childInput = trace.children?.[0]?.input;
  return isRecord( childInput ) ? childInput : undefined;
}

function findOutput( trace: TraceFile ): unknown {
  if ( trace.output !== undefined ) {
    return unwrapOutput( trace.output );
  }

  const endEvent = trace.events ?
    [ ...trace.events ].reverse().find( e => e.phase === 'end' ) :
    undefined;
  const eventOutput = ( endEvent?.details as Record<string, unknown> | undefined )?.output;
  if ( eventOutput !== undefined ) {
    return unwrapOutput( eventOutput );
  }

  const childOutput = trace.children?.[0]?.output;
  return childOutput !== undefined ? unwrapOutput( childOutput ) : undefined;
}

function computeExecutionTime( trace: TraceFile ): number | undefined {
  if ( trace.startedAt && trace.endedAt ) {
    return trace.endedAt - trace.startedAt;
  }
  if ( trace.root?.startTime && trace.root?.endTime ) {
    return trace.root.endTime - trace.root.startTime;
  }
  return trace.duration ?? trace.root?.duration ?? undefined;
}

export function extractDatasetFromTrace( traceData: TraceFile ): ExtractedDataset {
  const input = findInput( traceData );
  if ( !input ) {
    throw new Error( 'Could not extract input from trace data. Trace may be incomplete.' );
  }

  const output = findOutput( traceData );
  const executionTimeMs = computeExecutionTime( traceData );

  return { input, output, executionTimeMs };
}
