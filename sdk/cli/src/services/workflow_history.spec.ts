import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getWorkflowIdHistory } from '#api/generated/api.js';
import { fetchWorkflowHistory } from '#services/workflow_history.js';

vi.mock( '#api/generated/api.js', () => ( { getWorkflowIdHistory: vi.fn() } ) );

// The real correlator runs (only the API client is mocked), so spans are derived
// from the events below — letting us assert duration/offset behaviour end to end.
const mockGet = getWorkflowIdHistory as unknown as ReturnType<typeof vi.fn>;

const T0 = Date.parse( '2026-06-22T12:00:00.000Z' );
const at = ( seconds: number ): string => new Date( T0 + ( seconds * 1000 ) ).toISOString();
const page = ( data: Record<string, unknown> ): { status: number; data: Record<string, unknown> } =>
  ( { status: 200, data } );

const started = ( id: string, scheduledEventId: string, sec: number ): Record<string, unknown> => ( {
  eventId: id, eventTypeName: 'ACTIVITY_TASK_STARTED', eventTime: at( sec ),
  activityTaskStartedEventAttributes: { scheduledEventId, attempt: 1 }
} );
const completed = ( id: string, scheduledEventId: string, sec: number ): Record<string, unknown> => ( {
  eventId: id, eventTypeName: 'ACTIVITY_TASK_COMPLETED', eventTime: at( sec ),
  activityTaskCompletedEventAttributes: { scheduledEventId }
} );
const scheduled = ( id: string, name: string, sec: number ): Record<string, unknown> => ( {
  eventId: id, eventTypeName: 'ACTIVITY_TASK_SCHEDULED', eventTime: at( sec ),
  activityTaskScheduledEventAttributes: { activityType: { name }, activityId: `act-${id}` }
} );
const workflowStarted = ( sec: number ): Record<string, unknown> =>
  ( { eventId: '1', eventTypeName: 'WORKFLOW_EXECUTION_STARTED', eventTime: at( sec ) } );

beforeEach( () => mockGet.mockReset() );

describe( 'fetchWorkflowHistory', () => {
  it( 'pages through results, pinning the resolved runId after the first page', async () => {
    mockGet
      .mockResolvedValueOnce( page( {
        workflow: { workflowId: 'wf-123', runId: 'run-456', status: 'completed', startTime: at( 0 ), closeTime: at( 300 ) },
        runId: 'run-456',
        events: [ workflowStarted( 0 ), scheduled( '2', 'contentBrief#compressText', 0 ) ],
        nextPageToken: 'token-2'
      } ) )
      .mockResolvedValueOnce( page( {
        workflow: null,
        runId: 'run-456',
        events: [ started( '3', '2', 0 ), completed( '4', '2', 27 ) ],
        nextPageToken: null
      } ) );

    const result = await fetchWorkflowHistory( { workflowId: 'wf-123' } );

    expect( mockGet ).toHaveBeenCalledTimes( 2 );
    expect( mockGet ).toHaveBeenNthCalledWith( 1, 'wf-123', { runId: undefined, pageSize: 50, pageToken: undefined, includePayloads: false } );
    // Page 2 echoes the runId the first page resolved (the endpoint requires it once a pageToken is used).
    expect( mockGet ).toHaveBeenNthCalledWith( 2, 'wf-123', { runId: 'run-456', pageSize: 50, pageToken: 'token-2', includePayloads: false } );

    expect( result.runId ).toBe( 'run-456' );
    expect( result.workflow?.workflowId ).toBe( 'wf-123' ); // metadata is taken from the first page only
    expect( result.events ).toHaveLength( 4 );
    expect( result.totalDurationMs ).toBe( 300_000 ); // closeTime - startTime
    expect( result.spans ).toHaveLength( 1 );
    expect( result.spans[0].durationMs ).toBe( 27_000 );
  } );

  it( 'forwards an explicit runId and includePayloads, stopping after a single page', async () => {
    mockGet.mockResolvedValueOnce( page( {
      workflow: { workflowId: 'wf-9', runId: 'run-1', status: 'running', startTime: at( 0 ) },
      runId: 'run-1', events: [], nextPageToken: null
    } ) );

    const result = await fetchWorkflowHistory( { workflowId: 'wf-9', runId: 'run-1', includePayloads: true } );

    expect( mockGet ).toHaveBeenCalledTimes( 1 );
    expect( mockGet ).toHaveBeenCalledWith( 'wf-9', { runId: 'run-1', pageSize: 50, pageToken: undefined, includePayloads: true } );
    expect( result.runId ).toBe( 'run-1' );
  } );

  it( 'falls back to the last span end for total duration when there is no closeTime', async () => {
    mockGet.mockResolvedValueOnce( page( {
      workflow: { workflowId: 'wf-2', runId: 'run-2', status: 'running', startTime: at( 0 ) },
      runId: 'run-2',
      events: [ scheduled( '2', 'wf#step', 0 ), started( '3', '2', 0 ), completed( '4', '2', 12 ) ],
      nextPageToken: null
    } ) );

    const result = await fetchWorkflowHistory( { workflowId: 'wf-2' } );
    expect( result.totalDurationMs ).toBe( 12_000 );
  } );

  it( 'derives the timeline origin from WORKFLOW_EXECUTION_STARTED when metadata lacks a startTime', async () => {
    mockGet.mockResolvedValueOnce( page( {
      workflow: { workflowId: 'wf-3', runId: 'run-3', status: 'completed' }, // no startTime / closeTime
      runId: 'run-3',
      events: [ workflowStarted( 0 ), scheduled( '2', 'wf#step', 5 ), started( '3', '2', 5 ), completed( '4', '2', 10 ) ],
      nextPageToken: null
    } ) );

    const result = await fetchWorkflowHistory( { workflowId: 'wf-3' } );
    expect( result.spans[0].startOffsetMs ).toBe( 5_000 );
    expect( result.totalDurationMs ).toBe( 10_000 );
  } );

  it( 'throws when the response has no data', async () => {
    mockGet.mockResolvedValueOnce( { status: 200 } );
    await expect( fetchWorkflowHistory( { workflowId: 'wf-x' } ) ).rejects.toThrow( /invalid response/ );
  } );
} );
