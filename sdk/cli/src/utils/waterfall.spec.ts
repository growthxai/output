import { describe, it, expect } from 'vitest';
import renderWaterfall, {
  pickTickStep, formatTickLabel, formatDurationLabel, computeBar
} from './waterfall.js';
import type { Span, SpanStatus } from '#services/workflow_history/correlator.js';

const span = ( id: string, name: string, status: SpanStatus, startOffsetMs: number, durationMs: number ): Span => ( {
  id,
  name,
  technicalName: name,
  description: null,
  status,
  kind: 'activity',
  attempt: 1,
  startedAt: null,
  scheduledAt: null,
  completedAt: null,
  startOffsetMs,
  endOffsetMs: startOffsetMs + durationMs,
  durationMs,
  failureMessage: null
} );

describe( 'pickTickStep', () => {
  it( 'targets ~8 ticks by choosing the smallest sufficient step', () => {
    expect( pickTickStep( 0 ) ).toBe( 1_000 );
    expect( pickTickStep( 8_000 ) ).toBe( 1_000 );
    expect( pickTickStep( 80_000 ) ).toBe( 10_000 );
    expect( pickTickStep( 160_000 ) ).toBe( 30_000 );
  } );
} );

describe( 'formatTickLabel', () => {
  it( 'formats axis ticks like the UI', () => {
    expect( formatTickLabel( 0 ) ).toBe( '0' );
    expect( formatTickLabel( 500 ) ).toBe( '500ms' );
    expect( formatTickLabel( 27_000 ) ).toBe( '27s' );
    expect( formatTickLabel( 60_000 ) ).toBe( '1m' );
    expect( formatTickLabel( 72_000 ) ).toBe( '1m12s' );
    expect( formatTickLabel( 3_600_000 ) ).toBe( '1h' );
    expect( formatTickLabel( 3_660_000 ) ).toBe( '1h1m' );
  } );
} );

describe( 'formatDurationLabel', () => {
  it( 'always shows a unit, including zero', () => {
    expect( formatDurationLabel( 0 ) ).toBe( '0ms' );
    expect( formatDurationLabel( 999 ) ).toBe( '999ms' );
    expect( formatDurationLabel( 1_000 ) ).toBe( '1s' );
    expect( formatDurationLabel( 27_000 ) ).toBe( '27s' );
  } );

  it( 'carries a rounded-up remainder instead of rendering 60s/60m', () => {
    expect( formatDurationLabel( 59_500 ) ).toBe( '1m' );
    expect( formatDurationLabel( 119_500 ) ).toBe( '2m' );
    expect( formatDurationLabel( 3_599_500 ) ).toBe( '1h' );
  } );
} );

describe( 'computeBar', () => {
  it( 'maps offsets to columns with a min width and lane clamp', () => {
    expect( computeBar( 0, 27_000, 100_000, 50 ) ).toEqual( { startCol: 0, barLen: 14, instantaneous: false } );
    // Zero-duration step → a single thin marker
    expect( computeBar( 50_000, 50_000, 100_000, 50 ) ).toEqual( { startCol: 25, barLen: 1, instantaneous: true } );
    // A short step at the very end is clamped so it stays inside the lane
    expect( computeBar( 99_000, 100_000, 100_000, 50 ) ).toEqual( { startCol: 49, barLen: 1, instantaneous: false } );
  } );

  it( 'sizes the bar to span start→end without right-edge drift', () => {
    // Full-span step fills the lane exactly.
    expect( computeBar( 0, 100_000, 100_000, 50 ) ).toEqual( { startCol: 0, barLen: 50, instantaneous: false } );
    // End column is rounded from the true end offset (33), not start + a
    // separately-rounded width (which used to overshoot to col 34).
    expect( computeBar( 33_000, 66_000, 100_000, 50 ) ).toEqual( { startCol: 17, barLen: 16, instantaneous: false } );
  } );
} );

describe( 'renderWaterfall', () => {
  const spans = [
    span( 'a', 'Compress Text', 'completed', 0, 27_000 ),
    span( 'b', 'Generate Brief', 'pending', 40_000, 0 )
  ];

  it( 'renders labels, bars, durations and a header without color by default', () => {
    const out = renderWaterfall( spans, 40_000, { width: 70, color: false, header: 'wf-1 · run abcd1234 · running · 40s' } );
    expect( out ).toContain( 'Compress Text' );
    expect( out ).toContain( 'Generate Brief' );
    expect( out ).toContain( '█' );
    expect( out ).toContain( '27s' );
    expect( out ).toContain( 'wf-1 · run abcd1234' );
    expect( out ).not.toContain( '\x1b[' );
  } );

  it( 'emits ANSI color when enabled', () => {
    const out = renderWaterfall( spans, 40_000, { width: 70, color: true } );
    expect( out ).toContain( '\x1b[' );
    expect( out ).toContain( '\x1b[92m' ); // completed → green
  } );

  it( 'shows a friendly message when there are no steps', () => {
    const out = renderWaterfall( [], 1, { width: 70, color: false, header: 'wf-1' } );
    expect( out ).toContain( 'No steps found for this run.' );
  } );

  it( 'lists the reason under the chart for failed steps that carry a message', () => {
    const failed = { ...span( 'c', 'Scrape Serp Page', 'failed', 10_000, 2_000 ), failureMessage: 'connection reset' };
    const out = renderWaterfall( [ ...spans, failed ], 40_000, { width: 70, color: false } );
    expect( out ).toContain( 'Failures' );
    expect( out ).toContain( '✗ Scrape Serp Page: connection reset' );
  } );

  it( 'omits the failures section when no failed step has a message', () => {
    const out = renderWaterfall( spans, 40_000, { width: 70, color: false } );
    expect( out ).not.toContain( 'Failures' );
  } );
} );
