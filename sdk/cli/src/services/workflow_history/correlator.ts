/**
 * Correlates a flat list of Temporal history events into per-activity spans.
 *
 * Each ACTIVITY_TASK_SCHEDULED event opens a span (its eventId IS the
 * scheduledEventId every subsequent ACTIVITY_TASK_* event for the same activity
 * references). STARTED, COMPLETED, FAILED, TIMED_OUT, and CANCELED events extend
 * that span. Spans without a terminal event are 'running' (if STARTED was seen)
 * or 'pending'.
 *
 * Child workflows follow the same pattern but with their own event family:
 * START_CHILD_WORKFLOW_EXECUTION_INITIATED opens the span, then
 * CHILD_WORKFLOW_EXECUTION_STARTED / _COMPLETED / _FAILED / _TIMED_OUT /
 * _CANCELED / _TERMINATED reference it via `initiatedEventId`.
 */
import { capitalCase } from 'change-case';

export type SpanStatus = 'pending' | 'running' | 'completed' | 'failed';
export type SpanKind = 'activity' | 'child_workflow';

export interface Span {
  id: string;
  name: string;
  technicalName: string;
  description: string | null;
  status: SpanStatus;
  kind: SpanKind;
  attempt: number;
  startedAt: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  startOffsetMs: number;
  endOffsetMs: number;
  durationMs: number;
  failureMessage: string | null;
  input?: unknown;
  output?: unknown;
}

export type HistoryEvent = Record<string, unknown>;

interface Slot {
  scheduled: HistoryEvent;
  started: HistoryEvent | null;
  terminal: HistoryEvent | null;
}

interface TerminalFields {
  status?: SpanStatus;
  completedAt?: string | null;
  output?: unknown;
  failureMessage?: string | null;
}

// These are internal activities of the framework
const INTERNAL_ACTIVITIES_PREFIX = [ '__internal#' ];

const ACTIVITY_TERMINAL_TYPES = [
  'ACTIVITY_TASK_COMPLETED', 'ACTIVITY_TASK_FAILED',
  'ACTIVITY_TASK_TIMED_OUT', 'ACTIVITY_TASK_CANCELED'
];

const CHILD_TERMINAL_TYPES = [
  'CHILD_WORKFLOW_EXECUTION_COMPLETED', 'CHILD_WORKFLOW_EXECUTION_FAILED',
  'CHILD_WORKFLOW_EXECUTION_TIMED_OUT', 'CHILD_WORKFLOW_EXECUTION_CANCELED',
  'CHILD_WORKFLOW_EXECUTION_TERMINATED', 'START_CHILD_WORKFLOW_EXECUTION_FAILED'
];

function eventTypeName( event: HistoryEvent ): string {
  return ( event.eventTypeName as string | undefined ) ?? '';
}

function eventId( event: HistoryEvent ): string {
  return String( event.eventId );
}

function eventAttributes( event?: HistoryEvent ): Record<string, unknown> | undefined {
  const key = event && Object.keys( event ).find( k => k.endsWith( 'EventAttributes' ) );
  return key ? ( ( event as HistoryEvent )[key] as Record<string, unknown> ) : undefined;
}

// Temporal's int64 fields arrive as either a String (the API serializer
// stringifies scheduledEventId / startedEventId) or a raw protobuf Long struct
// `{ low, high, unsigned }` (initiatedEventId, etc). Normalize to a String key
// so both shapes match the opener event's stringified eventId.
function normalizeEventId( value: unknown ): string | null {
  if ( value === null || value === undefined ) {
    return null;
  }
  if ( typeof value === 'string' ) {
    return value || null;
  }
  if ( typeof value === 'object' && 'low' in ( value as Record<string, unknown> ) ) {
    const low = ( value as Record<string, unknown> ).low;
    return low === null || low === undefined ? null : String( low );
  }
  return String( value ) || null;
}

function scheduledEventIdFor( event: HistoryEvent ): string | null {
  return normalizeEventId( eventAttributes( event )?.scheduledEventId );
}

function initiatedEventIdFor( event: HistoryEvent ): string | null {
  return normalizeEventId( eventAttributes( event )?.initiatedEventId );
}

// For the noise filter: the full `workflow#step` name (prefixes/exacts match it).
function fullStepName( scheduled: HistoryEvent ): string {
  const attrs = eventAttributes( scheduled ) ?? {};
  return ( ( attrs.activityType as Record<string, unknown> | undefined )?.name as string | undefined ) ??
    ( attrs.stepName as string | undefined ) ??
    'unknown';
}

// For display: the bare step name (segment after `#`). The API serializer
// already exposes this as `stepName`; fall back to splitting `activityType.name`.
function cleanStepName( scheduled: HistoryEvent ): string {
  const attrs = eventAttributes( scheduled ) ?? {};
  const explicit = attrs.stepName as string | undefined;
  if ( explicit ) {
    return explicit;
  }
  const full = ( attrs.activityType as Record<string, unknown> | undefined )?.name as string | undefined;
  if ( full ) {
    return full.includes( '#' ) ? ( full.split( '#' ).pop() as string ) : full;
  }
  return 'unknown';
}

function isNoise( stepName: string ): boolean {
  return INTERNAL_ACTIVITIES_PREFIX.some( prefix => stepName.startsWith( prefix ) );
}

function failureMessageOf( attrs: Record<string, unknown> ): string | null {
  const failure = attrs.failure as Record<string, unknown> | undefined;
  return ( failure?.message as string | undefined ) ?? null;
}

function attemptFor( started: HistoryEvent | null ): number {
  return ( eventAttributes( started ?? undefined )?.attempt as number | undefined ) ?? 1;
}

function statusFor( started: HistoryEvent | null, terminalStatus?: SpanStatus ): SpanStatus {
  if ( terminalStatus ) {
    return terminalStatus;
  }
  return started ? 'running' : 'pending';
}

function parseTime( value: unknown ): string | null {
  if ( value === null || value === undefined || value === '' ) {
    return null;
  }
  return String( value );
}

function toMs( iso: string | null ): number | null {
  if ( !iso ) {
    return null;
  }
  const ms = Date.parse( iso );
  return Number.isNaN( ms ) ? null : ms;
}

// Offset math relative to the workflow start (timeline origin).
function withOffsets( span: Omit<Span, 'startOffsetMs' | 'endOffsetMs' | 'durationMs'>, startMs: number | null ): Span {
  const startAnchor = toMs( span.startedAt ) ?? toMs( span.scheduledAt );
  const startOffsetMs = startMs !== null && startAnchor !== null ? Math.round( startAnchor - startMs ) : 0;

  const endAnchor = toMs( span.completedAt ) ?? toMs( span.startedAt );
  const endOffsetMs = startMs !== null && endAnchor !== null ? Math.round( endAnchor - startMs ) : startOffsetMs;

  return { ...span, startOffsetMs, endOffsetMs, durationMs: endOffsetMs - startOffsetMs };
}

function resolveActivityTerminal( terminal: HistoryEvent | null ): TerminalFields {
  if ( !terminal ) {
    return {};
  }
  const attrs = eventAttributes( terminal ) ?? {};
  const completedAt = parseTime( terminal.eventTime );

  switch ( eventTypeName( terminal ) ) {
    case 'ACTIVITY_TASK_COMPLETED':
      return { status: 'completed', completedAt, output: attrs.result };
    case 'ACTIVITY_TASK_FAILED':
      return { status: 'failed', completedAt, failureMessage: failureMessageOf( attrs ) };
    case 'ACTIVITY_TASK_TIMED_OUT':
      return { status: 'failed', completedAt, failureMessage: 'Timed out' };
    case 'ACTIVITY_TASK_CANCELED':
      return { status: 'failed', completedAt, failureMessage: 'Canceled' };
    default:
      return {};
  }
}

function resolveChildTerminal( terminal: HistoryEvent | null ): TerminalFields {
  if ( !terminal ) {
    return {};
  }
  const attrs = eventAttributes( terminal ) ?? {};
  const completedAt = parseTime( terminal.eventTime );

  switch ( eventTypeName( terminal ) ) {
    case 'CHILD_WORKFLOW_EXECUTION_COMPLETED':
      return { status: 'completed', completedAt, output: attrs.result };
    case 'CHILD_WORKFLOW_EXECUTION_FAILED':
      return { status: 'failed', completedAt, failureMessage: failureMessageOf( attrs ) };
    case 'CHILD_WORKFLOW_EXECUTION_TIMED_OUT':
      return { status: 'failed', completedAt, failureMessage: 'Timed out' };
    case 'CHILD_WORKFLOW_EXECUTION_CANCELED':
      return { status: 'failed', completedAt, failureMessage: 'Canceled' };
    case 'CHILD_WORKFLOW_EXECUTION_TERMINATED':
      return { status: 'failed', completedAt, failureMessage: 'Terminated' };
    case 'START_CHILD_WORKFLOW_EXECUTION_FAILED':
      return { status: 'failed', completedAt, failureMessage: ( attrs.cause as string ) || 'Failed to start' };
    default:
      return {};
  }
}

function buildActivitySpan( id: string, slot: Slot, startMs: number | null ): Span {
  const { scheduled, started, terminal } = slot;
  const scheduledAttrs = eventAttributes( scheduled ) ?? {};
  const terminalFields = resolveActivityTerminal( terminal );

  return withOffsets( {
    id,
    name: capitalCase( cleanStepName( scheduled ) ),
    technicalName: fullStepName( scheduled ),
    description: null,
    status: statusFor( started, terminalFields.status ),
    kind: 'activity',
    attempt: attemptFor( started ),
    input: scheduledAttrs.input,
    output: terminalFields.output,
    startedAt: parseTime( started?.eventTime ),
    scheduledAt: parseTime( scheduled.eventTime ),
    completedAt: terminalFields.completedAt ?? null,
    failureMessage: terminalFields.failureMessage ?? null
  }, startMs );
}

// Child workflow spans render from the initiated event time so the full child
// duration is visible (matching Temporal's own UI). Pending children anchor at
// initiated time rather than null, else they'd all stack at offset 0.
function buildChildSpan( id: string, slot: Slot, startMs: number | null ): Span {
  const { scheduled, started, terminal } = slot;
  const scheduledAttrs = eventAttributes( scheduled ) ?? {};
  const workflowType = ( ( scheduledAttrs.workflowType as Record<string, unknown> | undefined )?.name as string | undefined ) ??
    'child_workflow';
  const terminalFields = resolveChildTerminal( terminal );

  return withOffsets( {
    id: `child-${id}`,
    name: capitalCase( workflowType ),
    technicalName: workflowType,
    description: null,
    status: statusFor( started, terminalFields.status ),
    kind: 'child_workflow',
    attempt: 1,
    input: scheduledAttrs.input,
    output: terminalFields.output,
    startedAt: parseTime( scheduled.eventTime ),
    scheduledAt: parseTime( scheduled.eventTime ),
    completedAt: terminalFields.completedAt ?? null,
    failureMessage: terminalFields.failureMessage ?? null
  }, startMs );
}

function emptySlot( opener: HistoryEvent ): Slot {
  return { scheduled: opener, started: null, terminal: null };
}

function attach( slots: Map<string, Slot>, event: HistoryEvent, key: string | null ): void {
  if ( !key ) {
    return;
  }
  const slot = slots.get( key );
  if ( !slot ) {
    return;
  }
  if ( eventTypeName( event ).endsWith( '_STARTED' ) ) {
    slot.started = event;
  } else {
    slot.terminal = event;
  }
}

/**
 * @param events - flat Temporal history events, in chronological order
 * @param workflowStartTimeMs - epoch ms used as the timeline origin (0 offset)
 */
export function correlate( events: HistoryEvent[], workflowStartTimeMs: number | null ): Span[] {
  const activities = new Map<string, Slot>();
  const children = new Map<string, Slot>();

  for ( const event of events ) {
    const type = eventTypeName( event );
    if ( type === 'ACTIVITY_TASK_SCHEDULED' ) {
      activities.set( eventId( event ), emptySlot( event ) );
    } else if ( type === 'ACTIVITY_TASK_STARTED' || ACTIVITY_TERMINAL_TYPES.includes( type ) ) {
      attach( activities, event, scheduledEventIdFor( event ) );
    } else if ( type === 'START_CHILD_WORKFLOW_EXECUTION_INITIATED' ) {
      children.set( eventId( event ), emptySlot( event ) );
    } else if ( type === 'CHILD_WORKFLOW_EXECUTION_STARTED' || CHILD_TERMINAL_TYPES.includes( type ) ) {
      attach( children, event, initiatedEventIdFor( event ) );
    }
  }

  const activitySpans = [ ...activities.entries() ]
    .filter( ( [ , slot ] ) => !isNoise( fullStepName( slot.scheduled ) ) )
    .map( ( [ id, slot ] ) => buildActivitySpan( id, slot, workflowStartTimeMs ) );

  const childSpans = [ ...children.entries() ]
    .map( ( [ id, slot ] ) => buildChildSpan( id, slot, workflowStartTimeMs ) )
    .filter( span => !isNoise( span.technicalName ) );

  return [ ...activitySpans, ...childSpans ].sort( ( a, b ) => a.startOffsetMs - b.startOffsetMs );
}
