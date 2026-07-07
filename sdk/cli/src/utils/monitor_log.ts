/**
 * Turns newly-correlated spans into append-only status lines for `workflow
 * monitor`. Unlike the waterfall (which needs the full span set up front to
 * lay out a time axis), a live monitor just reports each span's status
 * transitions as they're observed on each poll.
 */
import type { Span, SpanStatus } from '#services/workflow_history/correlator.js';
import { ANSI, formatDurationLabel } from '#utils/waterfall.js';

const GLYPH: Record<SpanStatus, string> = {
  pending: '·',
  running: '●',
  completed: '✓',
  failed: '✗'
};

export interface SpanUpdate {
  span: Span;
  label: string;
}

/**
 * Returns spans whose status changed since the last call. `seen` is mutated
 * in place so callers can carry it across polls. Pending spans are skipped —
 * nothing worth reporting until a step starts.
 */
export function diffSpanUpdates(
  spans: Span[],
  labels: Map<string, string>,
  seen: Map<string, SpanStatus>
): SpanUpdate[] {
  const updates: SpanUpdate[] = [];
  for ( const span of spans ) {
    if ( span.status === 'pending' || seen.get( span.id ) === span.status ) {
      continue;
    }
    seen.set( span.id, span.status );
    updates.push( { span, label: labels.get( span.id ) ?? span.name } );
  }
  return updates;
}

export function formatSpanUpdate( update: SpanUpdate, color: boolean ): string {
  const { span, label } = update;
  const glyph = GLYPH[span.status];
  const tint = ( text: string ): string => ( color ? `${ANSI[span.status]}${text}${ANSI.reset}` : text );

  switch ( span.status ) {
    case 'running':
      return `${tint( glyph )} ${label} running…`;
    case 'completed':
      return `${tint( glyph )} ${label}  ${formatDurationLabel( Math.max( 0, span.durationMs ) )}`;
    case 'failed': {
      const reason = span.failureMessage ? `: ${span.failureMessage}` : '';
      return `${tint( glyph )} ${label} failed${reason}`;
    }
    default:
      return `${glyph} ${label} ${span.status}`;
  }
}
