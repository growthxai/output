import { describe, it, expect } from 'vitest';
import buildSpanLabels from './span_labels.js';
import type { Span } from '#services/workflow_history/correlator.js';

const span = ( id: string, name: string ): Span => ( {
  id,
  name,
  technicalName: name,
  description: null,
  status: 'completed',
  kind: 'activity',
  attempt: 1,
  startedAt: null,
  scheduledAt: null,
  completedAt: null,
  startOffsetMs: 0,
  endOffsetMs: 0,
  durationMs: 0,
  failureMessage: null
} );

describe( 'buildSpanLabels', () => {
  it( 'numbers repeated labels chronologically and leaves unique labels untouched', () => {
    const spans = [
      span( 'a', 'Compress Text' ),
      span( 'b', 'Scrape Serp Page' ),
      span( 'c', 'Scrape Serp Page' ),
      span( 'd', 'Scrape Serp Page' )
    ];

    const labels = buildSpanLabels( spans );

    expect( labels.get( 'a' ) ).toBe( 'Compress Text' );
    expect( labels.get( 'b' ) ).toBe( 'Scrape Serp Page #1' );
    expect( labels.get( 'c' ) ).toBe( 'Scrape Serp Page #2' );
    expect( labels.get( 'd' ) ).toBe( 'Scrape Serp Page #3' );
  } );

  it( 'returns an empty map for no spans', () => {
    expect( buildSpanLabels( [] ).size ).toBe( 0 );
  } );
} );
