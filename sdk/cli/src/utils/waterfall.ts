/**
 * Renders a workflow's correlated spans as a terminal waterfall/Gantt chart —
 * a text analog of the Agents HQ "Timeline" view. Each row is a step, drawn as
 * a colored bar positioned by its start offset and sized by its duration, on a
 * shared time axis.
 *
 * The tick math (TICK_STEPS_MS / pickTickStep / formatTickLabel) is a port of
 * Atlas's `StepGantt`; the bar geometry mirrors its leftPct/widthPct as integer
 * terminal columns.
 */
import type { Span, SpanStatus } from '#services/workflow_history/correlator.js';

export interface WaterfallOptions {
  width: number;
  color: boolean;
  header?: string;
  labels?: Map<string, string>;
}

export interface BarGeometry {
  startCol: number;
  barLen: number;
  instantaneous: boolean;
}

const LABEL_MIN = 14;
const LABEL_MAX = 28;
const MIN_TRACK = 10;
const FULL_BLOCK = '█';
const THIN_BLOCK = '▏';

// Human-friendly step sizes, smallest → largest. Pick the smallest step that
// yields ~TARGET_TICKS or fewer labels.
const TICK_STEPS_MS = [
  100, 250, 500,
  1_000, 2_000, 5_000, 10_000, 15_000, 30_000,
  60_000, 2 * 60_000, 5 * 60_000, 10 * 60_000, 15 * 60_000, 30 * 60_000,
  60 * 60_000, 2 * 60 * 60_000, 6 * 60 * 60_000, 12 * 60 * 60_000, 24 * 60 * 60_000
];
const TARGET_TICKS = 8;

const ANSI: Record<SpanStatus | 'dim' | 'reset', string> = {
  completed: '[92m',
  running: '[33m',
  failed: '[31m',
  pending: '[90m',
  dim: '[2m',
  reset: '[0m'
};

function clamp( value: number, lo: number, hi: number ): number {
  return Math.min( Math.max( value, lo ), hi );
}

export function pickTickStep( totalMs: number ): number {
  if ( totalMs <= 0 ) {
    return 1_000;
  }
  const ideal = totalMs / TARGET_TICKS;
  return TICK_STEPS_MS.find( s => s >= ideal ) ?? TICK_STEPS_MS[TICK_STEPS_MS.length - 1];
}

export function buildTicks( totalMs: number ): number[] {
  const step = pickTickStep( totalMs );
  const count = Math.floor( totalMs / step );
  return Array.from( { length: count + 1 }, ( _, i ) => i * step );
}

// Round to whole units *before* splitting so a remainder that rounds up to a
// full unit carries instead of rendering "1m60s" / "1h60m".
function formatClock( ms: number ): string {
  const totalSec = Math.round( ms / 1_000 );
  if ( totalSec < 60 ) {
    return `${totalSec}s`;
  }
  if ( totalSec < 3_600 ) {
    const m = Math.floor( totalSec / 60 );
    const s = totalSec % 60;
    return s === 0 ? `${m}m` : `${m}m${s}s`;
  }
  const totalMin = Math.round( ms / 60_000 );
  const h = Math.floor( totalMin / 60 );
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}

export function formatTickLabel( ms: number ): string {
  if ( ms === 0 ) {
    return '0';
  }
  if ( ms < 1_000 ) {
    return `${ms}ms`;
  }
  return formatClock( ms );
}

export function formatDurationLabel( ms: number ): string {
  if ( ms < 1_000 ) {
    return `${Math.max( 0, Math.round( ms ) )}ms`;
  }
  return formatClock( ms );
}

// Map a span's [startOffset, endOffset] onto integer columns of a track that is
// `trackW` wide. Mirrors StepGantt's leftPct/widthPct, including the min-width
// floor and the clamp that keeps a bar from overflowing the lane.
export function computeBar( startOffsetMs: number, endOffsetMs: number, totalMs: number, trackW: number ): BarGeometry {
  const safeTotal = Math.max( totalMs, 1 );
  const rawLen = Math.round( ( ( endOffsetMs - startOffsetMs ) / safeTotal ) * trackW );
  const instantaneous = rawLen <= 0;
  const barLen = Math.min( Math.max( rawLen, 1 ), trackW );
  const startCol = clamp( Math.round( ( startOffsetMs / safeTotal ) * trackW ), 0, trackW - barLen );
  return { startCol, barLen, instantaneous };
}

function padOrTruncate( text: string, width: number ): string {
  if ( text.length === width ) {
    return text;
  }
  if ( text.length < width ) {
    return text.padEnd( width );
  }
  return `${text.slice( 0, width - 1 )}…`;
}

function truncate( text: string, width: number ): string {
  return text.length <= width ? text : `${text.slice( 0, Math.max( 0, width - 1 ) )}…`;
}

// First tick aligns left, last tick aligns right, middle ticks center on their
// position — so labels at 0 % and 100 % don't overflow the lane.
function tickRawStart( idx: number, count: number, col: number, labelLen: number, trackW: number ): number {
  if ( idx === 0 ) {
    return 0;
  }
  if ( idx === count - 1 ) {
    return trackW - labelLen;
  }
  return col - Math.floor( labelLen / 2 );
}

function tickStart( idx: number, count: number, col: number, labelLen: number, trackW: number ): number {
  return clamp( tickRawStart( idx, count, col, labelLen, trackW ), 0, trackW - labelLen );
}

function renderRuler( totalMs: number, labelW: number, trackW: number, tint: ( text: string, code: string ) => string ): string {
  const safeTotal = Math.max( totalMs, 1 );
  const ticks = buildTicks( safeTotal );

  const placements = ticks.reduce<{ writtenUntil: number; items: { start: number; label: string }[] }>(
    ( acc, t, idx ) => {
      const label = formatTickLabel( t );
      const col = Math.min( Math.round( ( t / safeTotal ) * trackW ), trackW - 1 );
      const start = tickStart( idx, ticks.length, col, label.length, trackW );
      if ( start <= acc.writtenUntil ) {
        return acc;
      }
      return { writtenUntil: start + label.length, items: [ ...acc.items, { start, label } ] };
    },
    { writtenUntil: -1, items: [] }
  );

  const chars = Array.from( { length: trackW }, () => ' ' );
  for ( const { start, label } of placements.items ) {
    [ ...label ].forEach( ( ch, i ) => {
      chars[start + i] = ch;
    } );
  }

  return `${' '.repeat( labelW + 1 )}${tint( chars.join( '' ), ANSI.dim )}`;
}

function renderLegend( tint: ( text: string, code: string ) => string ): string {
  const entry = ( status: SpanStatus, text: string ): string => `${tint( FULL_BLOCK, ANSI[status] )} ${text}`;
  const entries = [
    entry( 'completed', 'completed' ),
    entry( 'running', 'running' ),
    entry( 'failed', 'failed' ),
    entry( 'pending', 'pending' )
  ];
  return tint( entries.join( '   ' ), ANSI.dim );
}

// The bars only encode failure as a red lane; surface the reason underneath so a
// failed run is actionable from the chart alone. `failureMessage` is only
// populated when the history was fetched with payloads (the server strips it
// otherwise), so spans without one are simply omitted here.
function buildFailureLines(
  spans: Span[],
  labelFor: ( span: Span ) => string,
  width: number,
  tint: ( text: string, code: string ) => string
): string[] {
  const failed = spans.filter( span => span.status === 'failed' && span.failureMessage );
  if ( failed.length === 0 ) {
    return [];
  }
  const lines = failed.map( span => {
    const message = ( span.failureMessage ?? '' ).replace( /\s+/g, ' ' ).trim();
    return tint( truncate( `✗ ${labelFor( span )}: ${message}`, width ), ANSI.failed );
  } );
  return [ '', tint( 'Failures', ANSI.dim ), ...lines ];
}

export default function renderWaterfall( spans: Span[], totalDurationMs: number, options: WaterfallOptions ): string {
  const { width, color, header, labels } = options;
  if ( spans.length === 0 ) {
    return [ header, 'No steps found for this run.' ].filter( Boolean ).join( '\n\n' );
  }

  const tint = ( text: string, code: string ): string => ( color ? `${code}${text}${ANSI.reset}` : text );
  const labelFor = ( span: Span ): string => labels?.get( span.id ) ?? span.name;
  const durationFor = ( span: Span ): string => formatDurationLabel( Math.max( 0, span.durationMs ) );

  const longestLabel = Math.max( ...spans.map( s => labelFor( s ).length ) );
  const labelW = clamp( longestLabel, LABEL_MIN, LABEL_MAX );
  const durationW = Math.max( ...spans.map( s => durationFor( s ).length ) );
  const trackW = Math.max( width - labelW - durationW - 2, MIN_TRACK );

  const rows = spans.map( span => {
    const label = padOrTruncate( labelFor( span ), labelW );
    const { startCol, barLen, instantaneous } = computeBar( span.startOffsetMs, span.endOffsetMs, totalDurationMs, trackW );
    const glyph = instantaneous ? THIN_BLOCK : FULL_BLOCK;
    const leading = ' '.repeat( startCol );
    const trailing = ' '.repeat( Math.max( trackW - startCol - barLen, 0 ) );
    const track = `${leading}${tint( glyph.repeat( barLen ), ANSI[span.status] )}${trailing}`;
    const duration = tint( durationFor( span ).padStart( durationW ), ANSI.dim );
    return `${label} ${track} ${duration}`;
  } );

  const headerLines = header ? [ header, '' ] : [];
  const failureLines = buildFailureLines( spans, labelFor, width, tint );
  const legendLines = color ? [ '', renderLegend( tint ) ] : [];
  return [
    ...headerLines,
    renderRuler( totalDurationMs, labelW, trackW, tint ),
    ...rows,
    ...failureLines,
    ...legendLines
  ].join( '\n' );
}
