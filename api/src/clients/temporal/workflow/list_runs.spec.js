import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockTakeFromAsyncIterable } = vi.hoisted( () => ( {
  mockTakeFromAsyncIterable: vi.fn()
} ) );

vi.mock( '#utils', () => ( {
  takeFromAsyncIterable: mockTakeFromAsyncIterable
} ) );

describe( 'listRuns', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    mockTakeFromAsyncIterable.mockResolvedValue( [
      {
        workflowId: 'workflow-1',
        runId: 'run-1',
        type: 'factChecker',
        status: { name: 'COMPLETED' },
        startTime: new Date( '2024-01-01T00:00:00.000Z' ),
        closeTime: new Date( '2024-01-01T00:01:00.000Z' )
      },
      {
        workflowId: 'workflow-2',
        runId: 'run-2',
        type: 'writer',
        status: { name: 'RUNNING' },
        startTime: new Date( '2024-01-01T00:02:00.000Z' ),
        closeTime: null
      }
    ] );
  } );

  it( 'lists all workflows when no filters are provided', async () => {
    const iterable = Symbol( 'iterable' );
    const list = vi.fn().mockReturnValue( iterable );
    const client = { workflow: { list } };
    const { listRuns } = await import( './list_runs.js' );

    const result = await listRuns( { client } );

    expect( list ).toHaveBeenCalledWith( { query: undefined } );
    expect( mockTakeFromAsyncIterable ).toHaveBeenCalledWith( iterable, 100 );
    expect( result ).toEqual( {
      count: 2,
      runs: [
        {
          workflowId: 'workflow-1',
          runId: 'run-1',
          workflowType: 'factChecker',
          status: 'completed',
          startedAt: '2024-01-01T00:00:00.000Z',
          completedAt: '2024-01-01T00:01:00.000Z'
        },
        {
          workflowId: 'workflow-2',
          runId: 'run-2',
          workflowType: 'writer',
          status: 'running',
          startedAt: '2024-01-01T00:02:00.000Z',
          completedAt: null
        }
      ]
    } );
  } );

  it( 'filters by workflow type and task queue and honors the requested limit', async () => {
    const iterable = Symbol( 'iterable' );
    const list = vi.fn().mockReturnValue( iterable );
    const client = { workflow: { list } };
    const { listRuns } = await import( './list_runs.js' );

    await listRuns( { client }, { workflowType: 'factChecker', taskQueue: 'queue-a', limit: 10 } );

    expect( list ).toHaveBeenCalledWith( { query: 'WorkflowType = "factChecker" AND TaskQueue = "queue-a"' } );
    expect( mockTakeFromAsyncIterable ).toHaveBeenCalledWith( iterable, 10 );
  } );

  it( 'builds single-clause queries for each optional filter', async () => {
    const list = vi.fn().mockReturnValue( Symbol( 'iterable' ) );
    const client = { workflow: { list } };
    const { listRuns } = await import( './list_runs.js' );

    await listRuns( { client }, { workflowType: 'factChecker' } );
    await listRuns( { client }, { taskQueue: 'queue-a' } );

    expect( list ).toHaveBeenNthCalledWith( 1, { query: 'WorkflowType = "factChecker"' } );
    expect( list ).toHaveBeenNthCalledWith( 2, { query: 'TaskQueue = "queue-a"' } );
  } );
} );
