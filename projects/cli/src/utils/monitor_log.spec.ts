import { describe, it, expect } from 'vitest';
import type { Span, SpanStatus } from '#services/workflow_history/correlator.js';
import { diffSpanUpdates, formatSpanUpdate } from '#utils/monitor_log.js';

const span = ( overrides: Partial<Span> & { id: string; status: SpanStatus } ): Span => ( {
  name: 'Step',
  technicalName: 'wf#step',
  description: null,
  kind: 'activity',
  attempt: 1,
  startedAt: null,
  scheduledAt: null,
  completedAt: null,
  startOffsetMs: 0,
  endOffsetMs: 0,
  durationMs: 0,
  failureMessage: null,
  ...overrides
} );

describe( 'diffSpanUpdates', () => {
  it( 'skips pending spans', () => {
    const seen = new Map<string, SpanStatus>();
    const updates = diffSpanUpdates( [ span( { id: '1', status: 'pending' } ) ], new Map(), seen );
    expect( updates ).toHaveLength( 0 );
    expect( seen.size ).toBe( 0 );
  } );

  it( 'reports a span the first time it is seen in a non-pending status', () => {
    const seen = new Map<string, SpanStatus>();
    const updates = diffSpanUpdates( [ span( { id: '1', status: 'running' } ) ], new Map( [ [ '1', 'Fetch page' ] ] ), seen );
    expect( updates ).toHaveLength( 1 );
    expect( updates[0].label ).toBe( 'Fetch page' );
    expect( seen.get( '1' ) ).toBe( 'running' );
  } );

  it( 'does not re-report a span whose status is unchanged since the last call', () => {
    const seen = new Map<string, SpanStatus>( [ [ '1', 'running' ] ] );
    const updates = diffSpanUpdates( [ span( { id: '1', status: 'running' } ) ], new Map(), seen );
    expect( updates ).toHaveLength( 0 );
  } );

  it( 'reports a span again once its status transitions (running -> completed)', () => {
    const seen = new Map<string, SpanStatus>( [ [ '1', 'running' ] ] );
    const updates = diffSpanUpdates( [ span( { id: '1', status: 'completed' } ) ], new Map(), seen );
    expect( updates ).toHaveLength( 1 );
    expect( seen.get( '1' ) ).toBe( 'completed' );
  } );

  it( 'falls back to the span name when no label is provided', () => {
    const seen = new Map<string, SpanStatus>();
    const updates = diffSpanUpdates( [ span( { id: '1', status: 'running', name: 'Unlabeled' } ) ], new Map(), seen );
    expect( updates[0].label ).toBe( 'Unlabeled' );
  } );
} );

describe( 'formatSpanUpdate', () => {
  it( 'formats a running span', () => {
    const line = formatSpanUpdate( { span: span( { id: '1', status: 'running' } ), label: 'Fetch page' }, false );
    expect( line ).toBe( '● Fetch page running…' );
  } );

  it( 'formats a completed span with its duration', () => {
    const line = formatSpanUpdate(
      { span: span( { id: '1', status: 'completed', durationMs: 1234 } ), label: 'Fetch page' }, false
    );
    expect( line ).toBe( '✓ Fetch page  1s' );
  } );

  it( 'formats a failed span with its failure message', () => {
    const line = formatSpanUpdate(
      { span: span( { id: '1', status: 'failed', failureMessage: 'boom' } ), label: 'Fetch page' }, false
    );
    expect( line ).toBe( '✗ Fetch page failed: boom' );
  } );

  it( 'formats a failed span without a failure message', () => {
    const line = formatSpanUpdate( { span: span( { id: '1', status: 'failed' } ), label: 'Fetch page' }, false );
    expect( line ).toBe( '✗ Fetch page failed' );
  } );

  it( 'wraps the glyph in ANSI codes when color is enabled', () => {
    const line = formatSpanUpdate( { span: span( { id: '1', status: 'running' } ), label: 'Fetch page' }, true );
    expect( line ).toContain( '●' );
    expect( line ).not.toBe( '● Fetch page running…' ); // color codes present
  } );
} );
