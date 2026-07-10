import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getWorkflowIdHistory } from '#api/generated/api.js';
import { fetchWorkflowHistory, fetchWorkflowHistoryUpdates, type WorkflowHistoryCursor } from '#services/workflow_history.js';

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
    // Even though the server's own nextPageToken for the final page is empty (nothing more
    // buffered), the cursor keeps the *request* token that reached it — a genuinely resumable
    // position for a follow-up fetchWorkflowHistoryUpdates call. See fetchPages.
    expect( result.cursor.pageToken ).toBe( 'token-2' );
  } );

  it( 'a follow-up fetchWorkflowHistoryUpdates call resumes from fetchWorkflowHistory\'s cursor instead of re-paging from page 1', async () => {
    mockGet
      .mockResolvedValueOnce( page( {
        workflow: { workflowId: 'wf-123', runId: 'run-456', status: 'running', startTime: at( 0 ) },
        runId: 'run-456',
        events: [ workflowStarted( 0 ), scheduled( '2', 'wf#step', 0 ) ],
        nextPageToken: 'token-2'
      } ) )
      .mockResolvedValueOnce( page( {
        workflow: null,
        runId: 'run-456',
        events: [ started( '3', '2', 0 ) ],
        nextPageToken: null
      } ) );

    const first = await fetchWorkflowHistory( { workflowId: 'wf-123' } );
    expect( mockGet ).toHaveBeenCalledTimes( 2 );

    // The next tick replays the last page (deduped) then finds nothing new and times out —
    // one call, not a full re-walk from page 1 through both prior pages again.
    mockGet.mockResolvedValueOnce( page( {
      workflow: null, runId: 'run-456', events: [], nextPageToken: 'token-2'
    } ) );

    const { result, cursor } = await fetchWorkflowHistoryUpdates( { workflowId: 'wf-123', runId: 'run-456' }, first.cursor );

    expect( mockGet ).toHaveBeenCalledTimes( 3 );
    expect( mockGet ).toHaveBeenNthCalledWith( 3, 'wf-123', {
      runId: 'run-456', pageSize: 50, pageToken: 'token-2', includePayloads: false, wait: true
    } );
    expect( result.events ).toHaveLength( 3 );
    expect( cursor.pageToken ).toBe( 'token-2' );
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

  it( 'extracts the chained run id from a WORKFLOW_EXECUTION_CONTINUED_AS_NEW event', async () => {
    mockGet.mockResolvedValueOnce( page( {
      workflow: { workflowId: 'wf-4', runId: 'run-4', status: 'continued_as_new', startTime: at( 0 ) },
      runId: 'run-4',
      events: [
        workflowStarted( 0 ),
        {
          eventId: '9', eventTypeName: 'WORKFLOW_EXECUTION_CONTINUED_AS_NEW', eventTime: at( 60 ),
          workflowExecutionContinuedAsNewEventAttributes: { newExecutionRunId: 'run-5' }
        }
      ],
      nextPageToken: null
    } ) );

    const result = await fetchWorkflowHistory( { workflowId: 'wf-4' } );
    expect( result.continuedAsNewRunId ).toBe( 'run-5' );
  } );

  it( 'returns null continuedAsNewRunId when there is no continue-as-new event', async () => {
    mockGet.mockResolvedValueOnce( page( {
      workflow: { workflowId: 'wf-5', runId: 'run-5', status: 'completed', startTime: at( 0 ), closeTime: at( 1 ) },
      runId: 'run-5', events: [ workflowStarted( 0 ) ], nextPageToken: null
    } ) );

    const result = await fetchWorkflowHistory( { workflowId: 'wf-5' } );
    expect( result.continuedAsNewRunId ).toBeNull();
  } );
} );

describe( 'fetchWorkflowHistoryUpdates', () => {
  it( 'stops as soon as the first hop finds new events, without draining further buffered pages', async () => {
    // Two pages already exist beyond the resume point; the old behavior kept paging until a
    // timeout, which could silently merge several transitions (even a terminal one) into a
    // single delayed render. A poller needs each batch back as soon as it has something new.
    mockGet.mockResolvedValueOnce( page( {
      workflow: { workflowId: 'wf-7', runId: 'run-7', status: 'running', startTime: at( 0 ) },
      runId: 'run-7',
      events: [ workflowStarted( 0 ) ],
      nextPageToken: 'page-2'
    } ) );

    const { result, cursor } = await fetchWorkflowHistoryUpdates( { workflowId: 'wf-7', runId: 'run-7' } );

    expect( mockGet ).toHaveBeenCalledTimes( 1 );
    expect( mockGet ).toHaveBeenCalledWith( 'wf-7', {
      runId: 'run-7', pageSize: 50, pageToken: undefined, includePayloads: false, wait: true
    } );
    expect( result.events ).toHaveLength( 1 );
    expect( result.workflow?.status ).toBe( 'running' );
    // Resumes from the still-unfetched page 2 next time, not from the start.
    expect( cursor.pageToken ).toBe( 'page-2' );
    expect( cursor.lastEventId ).toBe( 1 );
  } );

  it( 'drains buffered pages when the describe already reports the run closed, so the terminal events are not stranded', async () => {
    // >1 page of events accumulated between polls, then the run completed: the fresh
    // describe says 'completed' before the closing events have been paged in. Stopping
    // after the first batch would make the poller act on the terminal status with the
    // final steps' events unfetched.
    mockGet
      .mockResolvedValueOnce( page( {
        workflow: { workflowId: 'wf-8', runId: 'run-8', status: 'completed', startTime: at( 0 ), closeTime: at( 30 ) },
        runId: 'run-8',
        events: [ workflowStarted( 0 ), scheduled( '2', 'wf#step', 0 ) ],
        nextPageToken: 'page-2'
      } ) )
      .mockResolvedValueOnce( page( {
        workflow: null,
        runId: 'run-8',
        events: [ started( '3', '2', 1 ), completed( '4', '2', 30 ) ],
        nextPageToken: null
      } ) );

    const { result } = await fetchWorkflowHistoryUpdates( { workflowId: 'wf-8', runId: 'run-8' } );

    expect( mockGet ).toHaveBeenCalledTimes( 2 );
    expect( result.events ).toHaveLength( 4 );
    expect( result.spans ).toHaveLength( 1 );
    expect( result.spans[0].status ).toBe( 'completed' );
  } );

  it( 'drains to the CONTINUED_AS_NEW event on a later page when the describe already reports continued_as_new', async () => {
    mockGet
      .mockResolvedValueOnce( page( {
        workflow: { workflowId: 'wf-9', runId: 'run-9', status: 'continued_as_new', startTime: at( 0 ) },
        runId: 'run-9',
        events: [ workflowStarted( 0 ) ],
        nextPageToken: 'page-2'
      } ) )
      .mockResolvedValueOnce( page( {
        workflow: null,
        runId: 'run-9',
        events: [ {
          eventId: '2', eventTypeName: 'WORKFLOW_EXECUTION_CONTINUED_AS_NEW', eventTime: at( 60 ),
          workflowExecutionContinuedAsNewEventAttributes: { newExecutionRunId: 'run-10' }
        } ],
        nextPageToken: null
      } ) );

    const { result } = await fetchWorkflowHistoryUpdates( { workflowId: 'wf-9', runId: 'run-9' } );

    expect( mockGet ).toHaveBeenCalledTimes( 2 );
    expect( result.continuedAsNewRunId ).toBe( 'run-10' );
  } );

  it( 'forwards waitMs to the API on a resumed poll', async () => {
    mockGet.mockResolvedValueOnce( page( {
      workflow: { workflowId: 'wf-7', runId: 'run-7', status: 'running', startTime: at( 0 ) },
      runId: 'run-7', events: [], nextPageToken: null
    } ) );

    await fetchWorkflowHistoryUpdates( { workflowId: 'wf-7', runId: 'run-7', waitMs: 2500 } );

    expect( mockGet ).toHaveBeenCalledWith( 'wf-7', {
      runId: 'run-7', pageSize: 50, pageToken: undefined, includePayloads: false, wait: true, waitMs: 2500
    } );
  } );

  it( 'omits waitMs when not provided', async () => {
    mockGet.mockResolvedValueOnce( page( {
      workflow: { workflowId: 'wf-7', runId: 'run-7', status: 'running', startTime: at( 0 ) },
      runId: 'run-7', events: [], nextPageToken: null
    } ) );

    await fetchWorkflowHistoryUpdates( { workflowId: 'wf-7', runId: 'run-7' } );

    expect( mockGet ).toHaveBeenCalledWith( 'wf-7', expect.not.objectContaining( { waitMs: expect.anything() } ) );
  } );

  it( 'times out with the sent token echoed back when there is genuinely nothing new', async () => {
    mockGet.mockResolvedValueOnce( page( {
      workflow: { workflowId: 'wf-7', runId: 'run-7', status: 'running', startTime: at( 0 ) },
      runId: 'run-7',
      events: [],
      nextPageToken: null
    } ) );

    const { result, cursor } = await fetchWorkflowHistoryUpdates( { workflowId: 'wf-7', runId: 'run-7' } );

    expect( mockGet ).toHaveBeenCalledTimes( 1 );
    expect( result.events ).toHaveLength( 0 );
    expect( cursor.pageToken ).toBeUndefined();
  } );

  it( 'resumes from a prior cursor and picks up the workflow status finishing, not the status frozen on the cursor', async () => {
    const cursor: WorkflowHistoryCursor = {
      pageToken: 'token-2',
      lastEventId: 2,
      meta: { workflowId: 'wf-6', runId: 'run-6', status: 'running', startTime: at( 0 ) },
      runId: 'run-6',
      events: [ workflowStarted( 0 ), scheduled( '2', 'wf#step', 0 ) ]
    };

    mockGet.mockResolvedValueOnce( page( {
      // The server re-describes on every `wait` call specifically so a resumed poll can see
      // status changes — this must win over the (now-stale) status carried on the cursor.
      workflow: { workflowId: 'wf-6', runId: 'run-6', status: 'completed', startTime: at( 0 ), closeTime: at( 5 ) },
      runId: 'run-6',
      events: [ started( '3', '2', 1 ), completed( '4', '2', 5 ) ],
      nextPageToken: null
    } ) );

    const { result, cursor: nextCursor } = await fetchWorkflowHistoryUpdates( { workflowId: 'wf-6', runId: 'run-6' }, cursor );

    expect( mockGet ).toHaveBeenCalledTimes( 1 );
    expect( mockGet ).toHaveBeenCalledWith( 'wf-6', {
      runId: 'run-6', pageSize: 50, pageToken: 'token-2', includePayloads: false, wait: true
    } );
    expect( result.workflow?.status ).toBe( 'completed' );
    // The events already carried on the cursor (2) plus the genuinely new ones (2).
    expect( result.events ).toHaveLength( 4 );
    expect( nextCursor.pageToken ).toBe( 'token-2' );
    expect( nextCursor.lastEventId ).toBe( 4 );
  } );
} );
