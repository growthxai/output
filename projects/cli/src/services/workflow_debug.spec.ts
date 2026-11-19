import { describe, it, expect, vi } from 'vitest';
import type { Client } from '@temporalio/client';
import { collectWorkflowDebug, decodeNode } from './workflow_debug.js';

const encode = ( encoding: string, data?: string ) => ( {
  metadata: { encoding: Buffer.from( encoding ).toString( 'base64' ) },
  ...( data === undefined ? {} : { data: Buffer.from( data ).toString( 'base64' ) } )
} );

const event = ( eventId: number, seconds: number, nanos: number, extra: object = {} ) => ( {
  eventId,
  eventTime: { seconds, nanos },
  eventType: 'EVENT_TYPE_TIMER_FIRED',
  ...extra
} );

const childStarted = ( eventId: number, seconds: number, nanos: number, workflowId: string, runId: string ) => event( eventId, seconds, nanos, {
  eventType: 'EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_STARTED',
  childWorkflowExecutionStartedEventAttributes: { workflowExecution: { workflowId, runId }, workflowType: { name: 'child_type' } }
} );

const continuedAsNew = ( eventId: number, seconds: number, nanos: number, newExecutionRunId: string ) => event( eventId, seconds, nanos, {
  eventType: 'EVENT_TYPE_WORKFLOW_EXECUTION_CONTINUED_AS_NEW',
  workflowExecutionContinuedAsNewEventAttributes: { newExecutionRunId }
} );

/** Histories are keyed by `workflowId/runId`, falling back to the workflow id alone; a page can be an Error */
type History = unknown[] | { pages: ( unknown[] | Error )[] } | Error;

type Pending = { pendingActivities?: unknown[]; pendingChildren?: unknown[] };

const buildClient = ( histories: Record<string, History>, statuses: Record<string, string> = {}, pending: Record<string, Pending> = {} ) => {
  type Request = { execution: { workflowId: string; runId: string }; nextPageToken?: Uint8Array };
  const getWorkflowExecutionHistory = vi.fn( async ( { execution, nextPageToken }: Request ) => {
    const history = histories[`${execution.workflowId}/${execution.runId}`] ?? histories[execution.workflowId];
    if ( history instanceof Error ) {
      throw history;
    }
    if ( Array.isArray( history ) ) {
      return { history: { events: history }, nextPageToken: new Uint8Array() };
    }
    const index = nextPageToken?.length ? Number( Buffer.from( nextPageToken ).toString() ) : 0;
    const page = history.pages[index];
    if ( page instanceof Error ) {
      throw page;
    }
    const hasMore = index + 1 < history.pages.length;
    return { history: { events: page }, nextPageToken: hasMore ? Buffer.from( String( index + 1 ) ) : new Uint8Array() };
  } );
  const withDeadline = vi.fn( async ( _deadline: number, fn: () => Promise<unknown> ) => fn() );
  const client = {
    options: { namespace: 'default' },
    connection: { withDeadline, workflowService: { getWorkflowExecutionHistory } },
    workflow: {
      getHandle: ( workflowId: string, runId?: string ) => ( {
        describe: async () => ( {
          workflowId,
          runId: runId ?? 'run-root',
          type: workflowId === 'root' ? 'root_type' : 'child_type',
          raw: {
            workflowExecutionInfo: { toJSON: () => ( { status: statuses[workflowId] ?? 'WORKFLOW_EXECUTION_STATUS_RUNNING' } ) },
            pendingActivities: pending[workflowId]?.pendingActivities ?? [],
            pendingChildren: pending[workflowId]?.pendingChildren ?? []
          }
        } )
      } )
    }
  } as unknown as Client;
  return { client, getWorkflowExecutionHistory, withDeadline };
};

const params = { address: 'localhost:7233', namespace: 'default', workflowId: 'root' };

describe( 'decodeNode', () => {
  it( 'decodes json payloads and keeps the rest of Temporal\'s shape', () => {
    const node = { activityTaskScheduledEventAttributes: { activityId: '5', input: { payloads: [ encode( 'json/plain', '{"a":1}' ) ] } } };
    expect( decodeNode( node ) ).toEqual( { activityTaskScheduledEventAttributes: { activityId: '5', input: { payloads: [ { a: 1 } ] } } } );
  } );

  it( 'cuts stack traces to their first lines wherever they appear', () => {
    const stackTrace = Array.from( { length: 12 }, ( _, i ) => `at line ${i}` ).join( '\n' );

    const { failure } = decodeNode( { failure: { message: 'boom', stackTrace } } ) as { failure: { message: string; stackTrace: string } };

    expect( failure.message ).toBe( 'boom' );
    expect( failure.stackTrace.split( '\n' ) ).toHaveLength( 11 );
    expect( failure.stackTrace ).toContain( '... [2 more lines omitted]' );
  } );

  it( 'summarizes binary payloads instead of printing them', () => {
    expect( decodeNode( encode( 'binary/plain', 'abc' ) ) ).toBe( '[Binary Payload: 3 bytes]' );
  } );

  it( 'prints a marker for payloads it cannot decode', () => {
    expect( decodeNode( encode( 'binary/encrypted', 'x' ) ) ).toBe( '[Undecodable Payload: binary/encrypted]' );
  } );
} );

describe( 'collectWorkflowDebug', () => {
  it( 'gives each workflow its own entry, root first, and adds nothing to the events', async () => {
    const { client } = buildClient( {
      root: [ event( 1, 10, 0 ), childStarted( 2, 20, 0, 'child', 'run-child' ), event( 3, 40, 0 ) ],
      child: [ event( 1, 30, 0 ) ]
    } );

    const result = await collectWorkflowDebug( client, params );

    expect( result ).toMatchObject( { complete: true, warnings: [], temporal: { address: 'localhost:7233', namespace: 'default' } } );
    expect( result.workflows.map( w => [ w.workflowId, w.runId, w.workflowType ] ) ).toEqual( [
      [ 'root', 'run-root', 'root_type' ],
      [ 'child', 'run-child', 'child_type' ]
    ] );
    expect( result.workflows[0] ).not.toHaveProperty( 'parent' );
    expect( result.workflows[1].parent ).toEqual( { workflowId: 'root', runId: 'run-root' } );
    expect( result.workflows[1].events ).toEqual( [ { eventId: '1', eventTime: expect.any( String ), eventType: 'EVENT_TYPE_TIMER_FIRED' } ] );
  } );

  it( 'takes each child\'s status from its own description', async () => {
    const { client } = buildClient(
      { root: [ childStarted( 1, 10, 0, 'child', 'run-child' ) ], child: [ event( 1, 20, 0 ) ] },
      { root: 'WORKFLOW_EXECUTION_STATUS_RUNNING', child: 'WORKFLOW_EXECUTION_STATUS_FAILED' }
    );

    const { workflows } = await collectWorkflowDebug( client, params );

    expect( workflows.map( w => w.status ) ).toEqual( [ 'WORKFLOW_EXECUTION_STATUS_RUNNING', 'WORKFLOW_EXECUTION_STATUS_FAILED' ] );
  } );

  it( 'orders children by the parsed time their parent reports them started, not by discovery or ISO text', async () => {
    const { client } = buildClient( {
      root: [ childStarted( 1, 10, 500_000_000, 'late', 'run-late' ), childStarted( 2, 10, 0, 'early', 'run-early' ) ],
      late: [ event( 1, 20, 0 ) ],
      early: [ event( 1, 20, 0 ) ]
    } );

    const { workflows } = await collectWorkflowDebug( client, params );

    expect( workflows.map( w => w.workflowId ) ).toEqual( [ 'root', 'early', 'late' ] );
  } );

  it( 'warns about a child whose history is gone, keeps its entry empty and still succeeds', async () => {
    const notFound = Object.assign( new Error( 'not found' ), { code: 5 } );
    const { client } = buildClient( { root: [ childStarted( 1, 10, 0, 'child', 'run-child' ) ], child: notFound } );

    const result = await collectWorkflowDebug( client, params );

    expect( result.complete ).toBe( false );
    expect( result.warnings ).toHaveLength( 1 );
    expect( result.warnings[0] ).toContain( 'child (run run-child)' );
    expect( result.workflows[1] ).toMatchObject( { workflowId: 'child', workflowType: 'child_type', status: null, events: [] } );
  } );

  it( 'stops at the page budget and warns about the child it never read', async () => {
    const { client } = buildClient( {
      root: [ childStarted( 1, 10, 0, 'a', 'run-a' ), childStarted( 2, 11, 0, 'b', 'run-b' ) ],
      a: [ event( 1, 20, 0 ) ],
      b: [ event( 1, 21, 0 ) ]
    } );

    const result = await collectWorkflowDebug( client, params, { pageBudget: 2, concurrency: 1 } );

    expect( result.complete ).toBe( false );
    expect( result.warnings ).toEqual( [ expect.stringContaining( 'Child workflow b (run run-b) was not read' ) ] );
    expect( result.workflows.find( w => w.workflowId === 'b' )?.events ).toEqual( [] );
    expect( result.workflows.find( w => w.workflowId === 'a' )?.events ).toHaveLength( 1 );
  } );

  it( 'warns about a history read only in part and keeps the events it read', async () => {
    const { client } = buildClient( { root: { pages: [ [ event( 1, 10, 0 ) ], [ event( 2, 11, 0 ) ] ] } } );

    const result = await collectWorkflowDebug( client, params, { pageBudget: 1 } );

    expect( result.warnings ).toEqual( [ expect.stringContaining( 'Workflow root (run run-root) was read only in part' ) ] );
    expect( result.workflows[0].events.map( e => e.eventId ) ).toEqual( [ '1' ] );
  } );

  it( 'cuts the last page to the event budget and names the events limit', async () => {
    const { client } = buildClient( { root: [ event( 1, 10, 0 ), event( 2, 11, 0 ), event( 3, 12, 0 ) ] } );

    const result = await collectWorkflowDebug( client, params, { eventBudget: 2 } );

    expect( result.complete ).toBe( false );
    expect( result.workflows[0].events.map( e => e.eventId ) ).toEqual( [ '1', '2' ] );
    expect( result.warnings ).toEqual( [ expect.stringMatching( /Workflow root \(run run-root\) was read only in part.*2 events/ ) ] );
  } );

  it( 'does not read children once the event budget is spent', async () => {
    const { client } = buildClient( {
      root: [ childStarted( 1, 10, 0, 'a', 'run-a' ) ],
      a: [ event( 1, 20, 0 ) ]
    } );

    const result = await collectWorkflowDebug( client, params, { eventBudget: 1 } );

    expect( result.warnings ).toEqual( [ expect.stringMatching( /Child workflow a \(run run-a\) was not read.*1 events/ ) ] );
    expect( result.workflows[1].events ).toEqual( [] );
  } );

  it( 'is complete when the history exactly fills the event budget', async () => {
    const { client } = buildClient( { root: [ event( 1, 10, 0 ), event( 2, 11, 0 ) ] } );

    const result = await collectWorkflowDebug( client, params, { eventBudget: 2 } );

    expect( result.complete ).toBe( true );
    expect( result.workflows[0].events ).toHaveLength( 2 );
  } );

  it( 'warns when a workflow is closed but its events stop before the end', async () => {
    const { client } = buildClient( { root: [ event( 1, 10, 0 ) ] }, { root: 'WORKFLOW_EXECUTION_STATUS_COMPLETED' } );

    const result = await collectWorkflowDebug( client, params );

    expect( result.complete ).toBe( false );
    expect( result.warnings ).toEqual( [ expect.stringContaining( 'Workflow root (run run-root) finished while it was being read' ) ] );
  } );

  it( 'does not warn when a closed workflow ends with its closing event', async () => {
    const closing = event( 2, 11, 0, { eventType: 'EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED' } );
    const { client } = buildClient( { root: [ event( 1, 10, 0 ), closing ] }, { root: 'WORKFLOW_EXECUTION_STATUS_COMPLETED' } );

    const result = await collectWorkflowDebug( client, params );

    expect( result ).toMatchObject( { complete: true, warnings: [] } );
  } );

  it( 'describes each workflow after its history was read', async () => {
    const { client, getWorkflowExecutionHistory } = buildClient( { root: [ event( 1, 10, 0 ) ] } );
    const order: string[] = [];
    getWorkflowExecutionHistory.mockImplementationOnce( async () => {
      order.push( 'history' );
      return { history: { events: [ event( 1, 10, 0 ) ] }, nextPageToken: new Uint8Array() };
    } );
    const { getHandle } = client.workflow;
    client.workflow.getHandle = ( ( ...args: Parameters<typeof getHandle> ) => {
      const handle = getHandle( ...args );
      return {
        describe: async () => {
          order.push( 'describe' );
          return handle.describe();
        }
      };
    } ) as typeof getHandle;

    await collectWorkflowDebug( client, params );

    expect( order ).toEqual( [ 'describe', 'history', 'describe' ] );
  } );

  it( 'keeps the events and warns when a workflow cannot be described after they were read', async () => {
    const { client } = buildClient( { root: [ event( 1, 10, 0 ) ] } );
    const { getHandle } = client.workflow;
    const calls = { count: 0 };
    client.workflow.getHandle = ( ( ...args: Parameters<typeof getHandle> ) => ( {
      describe: async () => {
        calls.count += 1;
        if ( calls.count > 1 ) {
          throw new Error( 'boom' );
        }
        return getHandle( ...args ).describe();
      }
    } ) ) as typeof getHandle;

    const result = await collectWorkflowDebug( client, params );

    expect( result.warnings ).toEqual( [ expect.stringContaining( 'Workflow root (run run-root) could not be described: boom' ) ] );
    expect( result.workflows[0].events ).toHaveLength( 1 );
  } );

  it( 'reads every page of a long history', async () => {
    const { client } = buildClient( { root: { pages: [ [ event( 1, 10, 0 ) ], [ event( 2, 11, 0 ) ] ] } } );

    const result = await collectWorkflowDebug( client, params );

    expect( result.complete ).toBe( true );
    expect( result.workflows[0].events.map( e => e.eventId ) ).toEqual( [ '1', '2' ] );
  } );

  it( 'follows a child that continues as new, one entry per run, in time order and with the same parent', async () => {
    const { client } = buildClient( {
      root: [ childStarted( 1, 10, 0, 'child', 'run-1' ), childStarted( 2, 12, 0, 'other', 'run-other' ) ],
      'child/run-1': [ event( 1, 20, 0 ), continuedAsNew( 2, 21, 0, 'run-2' ) ],
      'child/run-2': [ event( 1, 22, 0 ), continuedAsNew( 2, 23, 0, 'run-3' ) ],
      'child/run-3': [ event( 1, 24, 0 ) ],
      other: [ event( 1, 30, 0 ) ]
    } );

    const result = await collectWorkflowDebug( client, params );

    expect( result.complete ).toBe( true );
    expect( result.workflows.map( w => `${w.workflowId}/${w.runId}` ) ).toEqual( [
      'root/run-root', 'child/run-1', 'other/run-other', 'child/run-2', 'child/run-3'
    ] );
    expect( result.workflows.slice( 1 ).map( w => w.parent ) ).toEqual( Array( 4 ).fill( { workflowId: 'root', runId: 'run-root' } ) );
    expect( result.workflows[3].workflowType ).toBe( 'child_type' );
  } );

  it( 'reads a continued child run even when it is a child of a continued run', async () => {
    const { client } = buildClient( {
      root: [ childStarted( 1, 10, 0, 'child', 'run-1' ) ],
      'child/run-1': [ continuedAsNew( 1, 20, 0, 'run-2' ) ],
      'child/run-2': [ childStarted( 1, 30, 0, 'grandchild', 'run-g' ) ],
      grandchild: [ event( 1, 40, 0 ) ]
    } );

    const { workflows } = await collectWorkflowDebug( client, params );

    expect( workflows.map( w => `${w.workflowId}/${w.runId}` ) ).toEqual( [ 'root/run-root', 'child/run-1', 'child/run-2', 'grandchild/run-g' ] );
    expect( workflows[3].parent ).toEqual( { workflowId: 'child', runId: 'run-2' } );
  } );

  it( 'warns when the next run of a continued child is gone', async () => {
    const notFound = Object.assign( new Error( 'not found' ), { code: 5 } );
    const { client } = buildClient( {
      root: [ childStarted( 1, 10, 0, 'child', 'run-1' ) ],
      'child/run-1': [ continuedAsNew( 1, 20, 0, 'run-2' ) ],
      'child/run-2': notFound
    } );

    const result = await collectWorkflowDebug( client, params );

    expect( result.complete ).toBe( false );
    expect( result.warnings ).toEqual( [ expect.stringContaining( 'child (run run-2) is no longer in Temporal' ) ] );
    expect( result.workflows.at( -1 )?.events ).toEqual( [] );
  } );

  it( 'follows the continuation of the root too, with no parent, placed by time among the children', async () => {
    const { client } = buildClient( {
      'root/run-root': [ childStarted( 1, 10, 0, 'a', 'run-a' ), continuedAsNew( 2, 20, 0, 'run-2' ) ],
      'root/run-2': [ childStarted( 1, 30, 0, 'b', 'run-b' ) ],
      a: [ event( 1, 15, 0 ) ],
      b: [ event( 1, 35, 0 ) ]
    } );

    const { workflows } = await collectWorkflowDebug( client, params );

    expect( workflows.map( w => `${w.workflowId}/${w.runId}` ) ).toEqual( [ 'root/run-root', 'a/run-a', 'root/run-2', 'b/run-b' ] );
    expect( workflows[2] ).not.toHaveProperty( 'parent' );
    expect( workflows[3].parent ).toEqual( { workflowId: 'root', runId: 'run-2' } );
  } );

  it( 'starts from the requested run and follows its continuations to the latest', async () => {
    const { client } = buildClient( {
      'root/run-old': [ continuedAsNew( 1, 10, 0, 'run-new' ) ],
      'root/run-new': [ event( 1, 20, 0 ) ]
    } );

    const { workflows } = await collectWorkflowDebug( client, { ...params, runId: 'run-old' } );

    expect( workflows.map( w => w.runId ) ).toEqual( [ 'run-old', 'run-new' ] );
  } );

  it( 'counts continued runs against the shared page budget and warns about the ones not read', async () => {
    const { client, getWorkflowExecutionHistory } = buildClient( {
      'root/run-root': [ continuedAsNew( 1, 10, 0, 'run-2' ) ],
      'root/run-2': [ continuedAsNew( 1, 20, 0, 'run-3' ) ],
      'root/run-3': [ event( 1, 30, 0 ) ]
    } );

    const result = await collectWorkflowDebug( client, params, { pageBudget: 2 } );

    expect( getWorkflowExecutionHistory ).toHaveBeenCalledTimes( 2 );
    expect( result.complete ).toBe( false );
    expect( result.warnings ).toEqual( [ expect.stringMatching( /^Workflow root \(run run-3\) was not read: the limit of 2 pages/ ) ] );
    expect( result.workflows.at( -1 )?.events ).toEqual( [] );
  } );

  it( 'reports the pending activities and children Temporal describes, with decoded failures', async () => {
    const lastFailure = { message: 'Foo', stackTrace: 'Error: Foo', details: { payloads: [ encode( 'json/plain', '{"code":7}' ) ] } };
    const activity = {
      activityId: '2',
      activityType: { name: 'wf#step' },
      state: 'PENDING_ACTIVITY_STATE_SCHEDULED',
      attempt: 2,
      lastFailure,
      ignored: true
    };
    const pendingChild = { workflowId: 'child', runId: 'run-c', workflowTypeName: 'child_type', ignored: true };
    const pending = {
      root: {
        pendingActivities: [ { toJSON: () => activity } ],
        pendingChildren: [ pendingChild ]
      }
    };
    const { client } = buildClient( { root: [ event( 1, 10, 0 ) ] }, {}, pending );

    const [ root ] = ( await collectWorkflowDebug( client, params ) ).workflows;

    expect( root.pendingActivities ).toEqual( [ {
      activityId: '2',
      activityType: 'wf#step',
      state: 'PENDING_ACTIVITY_STATE_SCHEDULED',
      attempt: 2,
      lastFailure: { message: 'Foo', stackTrace: 'Error: Foo', details: { payloads: [ { code: 7 } ] } }
    } ] );
    expect( root.pendingChildren ).toEqual( [ { workflowId: 'child', runId: 'run-c', workflowType: 'child_type' } ] );
  } );

  it( 'reads a child once even when its parent reports it twice', async () => {
    const { client, getWorkflowExecutionHistory } = buildClient( {
      root: [ childStarted( 1, 10, 0, 'child', 'run-c' ), childStarted( 2, 11, 0, 'child', 'run-c' ) ],
      child: [ event( 1, 20, 0 ) ]
    } );

    const { workflows } = await collectWorkflowDebug( client, params );

    expect( workflows.map( w => w.workflowId ) ).toEqual( [ 'root', 'child' ] );
    expect( getWorkflowExecutionHistory ).toHaveBeenCalledTimes( 2 );
  } );

  it( 'throws when the requested run cannot be read at all', async () => {
    const { client } = buildClient( { root: new Error( 'boom' ) } );

    await expect( collectWorkflowDebug( client, params ) ).rejects.toThrow( 'boom' );
  } );

  it( 'turns any other failure on a child into a warning and keeps reading the rest', async () => {
    const { client } = buildClient( {
      root: [ childStarted( 1, 10, 0, 'bad', 'run-bad' ), childStarted( 2, 11, 0, 'good', 'run-good' ) ],
      bad: new Error( 'permission denied' ),
      good: [ event( 1, 20, 0 ) ]
    } );

    const result = await collectWorkflowDebug( client, params );

    expect( result.complete ).toBe( false );
    expect( result.warnings ).toEqual( [ 'Child workflow bad (run run-bad) could not be read: permission denied. Its entry has no events.' ] );
    expect( result.workflows.map( w => [ w.workflowId, w.events.length ] ) ).toEqual( [ [ 'root', 2 ], [ 'bad', 0 ], [ 'good', 1 ] ] );
  } );

  it( 'keeps the events already read when a later page fails, for the requested run too', async () => {
    const { client } = buildClient( { root: { pages: [ [ event( 1, 10, 0 ) ], new Error( 'unavailable' ) ] } } );

    const result = await collectWorkflowDebug( client, params );

    expect( result.complete ).toBe( false );
    expect( result.warnings ).toEqual( [ 'Workflow root (run run-root) could not be read: unavailable. Its entry has the events read so far.' ] );
    expect( result.workflows[0].events.map( e => e.eventId ) ).toEqual( [ '1' ] );
  } );

  it( 'runs every Temporal call under a deadline', async () => {
    const { client, withDeadline, getWorkflowExecutionHistory } = buildClient( { root: [ event( 1, 10, 0 ) ] } );

    await collectWorkflowDebug( client, params );

    // the first describe, one history page and the describe after it
    expect( withDeadline ).toHaveBeenCalledTimes( 3 );
    expect( getWorkflowExecutionHistory ).toHaveBeenCalledTimes( 1 );
    expect( withDeadline.mock.calls[0][0] ).toBeGreaterThan( Date.now() );
  } );

  it( 'says so when Temporal does not answer in time', async () => {
    const deadline = Object.assign( new Error( '4 DEADLINE_EXCEEDED: Deadline exceeded' ), { code: 4 } );
    const { client } = buildClient( { root: deadline } );

    await expect( collectWorkflowDebug( client, params ) ).rejects.toThrow( 'Temporal did not answer within 30s' );
  } );

  it( 'serializes the summary first and the events last in each workflow', async () => {
    const { client } = buildClient( { root: [ event( 1, 10, 0 ) ] } );

    const result = await collectWorkflowDebug( client, params );
    const parsed = JSON.parse( JSON.stringify( result ) );

    expect( Object.keys( parsed ) ).toEqual( [ 'complete', 'warnings', 'temporal', 'workflows' ] );
    expect( Object.keys( parsed.workflows[0] ).at( -1 ) ).toBe( 'events' );
  } );
} );
