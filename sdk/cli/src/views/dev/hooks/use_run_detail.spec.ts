import { describe, expect, it } from 'vitest';
import { extractSteps } from './use_run_detail.js';
import type { TraceData } from '#types/trace.js';

const trace = ( children: TraceData['children'] ): TraceData => ( {
  root: { workflowName: 'demo', workflowId: 'wf-1', startTime: 0 },
  children
} );

describe( 'extractSteps', () => {
  it( 'returns an empty array when the trace has no children', () => {
    expect( extractSteps( null ) ).toEqual( [] );
    expect( extractSteps( trace( [] ) ) ).toEqual( [] );
  } );

  it( 'filters out start-phase events', () => {
    const t = trace( [
      { phase: 'start', name: 'should-skip' },
      { phase: 'end', name: 'kept', status: 'completed', duration: 100 }
    ] );
    const steps = extractSteps( t );
    expect( steps ).toHaveLength( 1 );
    expect( steps[0].name ).toBe( 'kept' );
  } );

  it( 'maps phase=error and an error field to status=failed', () => {
    const t = trace( [
      { phase: 'error', name: 'boom', error: 'oops' },
      { phase: 'end', name: 'fine', error: 'still-failed' }
    ] );
    const steps = extractSteps( t );
    expect( steps[0].status ).toBe( 'failed' );
    expect( steps[1].status ).toBe( 'failed' );
  } );

  it( 'falls back to startTime/endTime for duration', () => {
    const t = trace( [
      { phase: 'end', name: 'with-times', startTime: 1000, endTime: 1500 }
    ] );
    const steps = extractSteps( t );
    expect( steps[0].durationMs ).toBe( 500 );
  } );

  it( 'prefers explicit duration when present', () => {
    const t = trace( [
      { phase: 'end', name: 'has-duration', duration: 250, startTime: 0, endTime: 9999 }
    ] );
    const steps = extractSteps( t );
    expect( steps[0].durationMs ).toBe( 250 );
  } );

  it( 'composes a fallback name from kind and stepName when name is missing', () => {
    const t = trace( [
      { phase: 'end', kind: 'activity', stepName: 'extract', status: 'completed' }
    ] );
    const steps = extractSteps( t );
    expect( steps[0].name ).toBe( 'activity#extract' );
  } );

  it( 'reads input/output from `details` when not on the node directly', () => {
    const t = trace( [
      { phase: 'end', name: 'has-details', details: { input: { x: 1 }, output: { y: 2 } } }
    ] );
    const steps = extractSteps( t );
    expect( steps[0].input ).toEqual( { x: 1 } );
    expect( steps[0].output ).toEqual( { y: 2 } );
  } );

  it( 'numbers steps starting at 1', () => {
    const t = trace( [
      { phase: 'end', name: 'first' },
      { phase: 'end', name: 'second' },
      { phase: 'end', name: 'third' }
    ] );
    const steps = extractSteps( t );
    expect( steps.map( s => s.index ) ).toEqual( [ 1, 2, 3 ] );
  } );
} );
