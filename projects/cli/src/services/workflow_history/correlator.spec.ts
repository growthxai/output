import { describe, it, expect } from 'vitest';
import { correlate, type HistoryEvent } from './correlator.js';

const T0 = Date.parse( '2026-06-22T12:00:00.000Z' );
const at = ( seconds: number ): string => new Date( T0 + ( seconds * 1000 ) ).toISOString();

// Minimal Temporal-shaped event builders.
const scheduled = ( id: string, name: string, sec: number, input?: unknown ): HistoryEvent => ( {
  eventId: id,
  eventTypeName: 'ACTIVITY_TASK_SCHEDULED',
  eventTime: at( sec ),
  activityTaskScheduledEventAttributes: { activityType: { name }, activityId: `act-${id}`, input }
} );

const started = ( id: string, scheduledEventId: string, sec: number ): HistoryEvent => ( {
  eventId: id,
  eventTypeName: 'ACTIVITY_TASK_STARTED',
  eventTime: at( sec ),
  activityTaskStartedEventAttributes: { scheduledEventId, attempt: 1 }
} );

const completed = ( id: string, scheduledEventId: string, sec: number ): HistoryEvent => ( {
  eventId: id,
  eventTypeName: 'ACTIVITY_TASK_COMPLETED',
  eventTime: at( sec ),
  activityTaskCompletedEventAttributes: { scheduledEventId, result: { ok: true } }
} );

const failed = ( id: string, scheduledEventId: string, sec: number, message: string ): HistoryEvent => ( {
  eventId: id,
  eventTypeName: 'ACTIVITY_TASK_FAILED',
  eventTime: at( sec ),
  activityTaskFailedEventAttributes: { scheduledEventId, failure: { message } }
} );

function buildEvents(): HistoryEvent[] {
  return [
    { eventId: '1', eventTypeName: 'WORKFLOW_EXECUTION_STARTED', eventTime: at( 0 ), workflowExecutionStartedEventAttributes: {} },

    // Sequential completed activity (0s → 27s)
    scheduled( '2', 'contentBrief#compressText', 0, { text: 'x' } ),
    started( '3', '2', 0 ),
    completed( '4', '2', 27 ),

    // Parallel fan-out of the same step: one completes (1s), one fails (8s)
    scheduled( '5', 'contentBrief#scrapeSerpPage', 30 ),
    scheduled( '6', 'contentBrief#scrapeSerpPage', 30 ),
    started( '7', '5', 30 ),
    started( '8', '6', 30 ),
    completed( '9', '5', 31 ),
    failed( '10', '6', 38, 'boom' ),

    // Noise steps — must be filtered out
    scheduled( '12', '__internal#resolveTrace', 35 ),

    // Pending activity (scheduled, never started)
    scheduled( '13', 'contentBrief#generateBrief', 40 ),

    // Child workflow (initiatedEventId arrives as a protobuf Long struct)
    {
      eventId: '20', eventTypeName: 'START_CHILD_WORKFLOW_EXECUTION_INITIATED', eventTime: at( 50 ),
      startChildWorkflowExecutionInitiatedEventAttributes: { workflowType: { name: 'subWorkflow' } }
    },
    {
      eventId: '21', eventTypeName: 'CHILD_WORKFLOW_EXECUTION_STARTED', eventTime: at( 50 ),
      childWorkflowExecutionStartedEventAttributes: { initiatedEventId: { low: 20, high: 0, unsigned: false } }
    },
    {
      eventId: '22', eventTypeName: 'CHILD_WORKFLOW_EXECUTION_COMPLETED', eventTime: at( 60 ),
      childWorkflowExecutionCompletedEventAttributes: { initiatedEventId: { low: 20, high: 0, unsigned: false }, result: { done: true } }
    }
  ];
}

describe( 'correlate', () => {
  const spans = correlate( buildEvents(), T0 );
  const byId = ( id: string ) => spans.find( s => s.id === id );

  it( 'filters framework noise steps', () => {
    expect( spans.every( s => !s.technicalName.startsWith( '__internal#' ) ) ).toBe( true );
  } );

  it( 'produces one span per real activity plus the child workflow', () => {
    expect( spans ).toHaveLength( 5 );
  } );

  it( 'returns spans sorted by start offset', () => {
    const offsets = spans.map( s => s.startOffsetMs );
    expect( offsets ).toEqual( [ ...offsets ].sort( ( a, b ) => a - b ) );
  } );

  it( 'correlates a completed activity with humanized name, offset, and duration', () => {
    const compress = byId( '2' )!;
    expect( compress.name ).toBe( 'Compress Text' );
    expect( compress.status ).toBe( 'completed' );
    expect( compress.startOffsetMs ).toBe( 0 );
    expect( compress.durationMs ).toBe( 27_000 );
    expect( compress.attempt ).toBe( 1 );
    expect( compress.kind ).toBe( 'activity' );
  } );

  it( 'distinguishes parallel instances of the same step', () => {
    const ok = byId( '5' )!;
    const bad = byId( '6' )!;
    expect( ok.name ).toBe( 'Scrape Serp Page' );
    expect( ok.status ).toBe( 'completed' );
    expect( ok.startOffsetMs ).toBe( 30_000 );
    expect( ok.durationMs ).toBe( 1_000 );

    expect( bad.status ).toBe( 'failed' );
    expect( bad.failureMessage ).toBe( 'boom' );
    expect( bad.durationMs ).toBe( 8_000 );
  } );

  it( 'marks a scheduled-only activity pending with a zero-duration span at its scheduled offset', () => {
    const pending = byId( '13' )!;
    expect( pending.status ).toBe( 'pending' );
    expect( pending.startOffsetMs ).toBe( 40_000 );
    expect( pending.durationMs ).toBe( 0 );
  } );

  it( 'correlates a child workflow via a Long-struct initiatedEventId', () => {
    const child = byId( 'child-20' )!;
    expect( child.name ).toBe( 'Sub Workflow' );
    expect( child.kind ).toBe( 'child_workflow' );
    expect( child.status ).toBe( 'completed' );
    expect( child.startOffsetMs ).toBe( 50_000 );
    expect( child.durationMs ).toBe( 10_000 );
  } );

  it( 'is robust to an empty event list', () => {
    expect( correlate( [], T0 ) ).toEqual( [] );
  } );
} );
