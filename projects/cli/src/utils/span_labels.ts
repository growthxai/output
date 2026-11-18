/**
 * A step's name is per step-TYPE, so a fan-out of N identical activities (e.g.
 * 9× "Scrape Serp Page") all share one label and become indistinguishable.
 * Number the repeats in chronological order so each instance is addressable —
 * "Scrape Serp Page #1", "#2", …. Labels that occur once are left untouched.
 *
 * Pass spans in their stored (chronological) order so #1 is the earliest. A
 * TypeScript port of Atlas's `buildSpanLabels`.
 */
import type { Span } from '#services/workflow_history/correlator.js';

const baseLabel = ( span: Span ): string => span.description ?? span.name;

export default function buildSpanLabels( spans: Span[] ): Map<string, string> {
  const totals = new Map<string, number>();
  for ( const span of spans ) {
    const label = baseLabel( span );
    totals.set( label, ( totals.get( label ) ?? 0 ) + 1 );
  }

  const seen = new Map<string, number>();
  const labels = new Map<string, string>();
  for ( const span of spans ) {
    const label = baseLabel( span );
    if ( ( totals.get( label ) ?? 0 ) > 1 ) {
      const n = ( seen.get( label ) ?? 0 ) + 1;
      seen.set( label, n );
      labels.set( span.id, `${label} #${n}` );
    } else {
      labels.set( span.id, label );
    }
  }
  return labels;
}
