import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockIsGrpcCancelledError, mockFormatStatus } = vi.hoisted( () => ( {
  mockIsGrpcCancelledError: vi.fn( err => err?._cancelled === true ),
  mockFormatStatus: vi.fn( name => `formatted:${name}` )
} ) );

vi.mock( '@temporalio/client', () => ( {
  isGrpcCancelledError: mockIsGrpcCancelledError,
  WorkflowNotFoundError: class WorkflowNotFoundError extends Error {
    constructor( message ) {
      super( message );
      this.name = 'WorkflowNotFoundError';
    }
  }
} ) );

vi.mock( '../types.js', async importOriginal => ( {
  ...( await importOriginal() ),
  formatStatus: mockFormatStatus
} ) );

const { describeWorkflow } = await import( './describe_workflow.js' );

const baseDescription = {
  runId: 'run-1',
  status: { code: 1, name: 'RUNNING' },
  startTime: new Date( '2024-01-01T00:00:00.000Z' ),
  closeTime: null,
  historyLength: 7,
  taskQueue: 'queue-a'
};

const makeContext = describeFn => ( {
  client: { workflow: { getHandle: vi.fn().mockReturnValue( { describe: describeFn } ) } }
} );

describe( 'describeWorkflow', () => {
  beforeEach( () => vi.clearAllMocks() );

  it( 'maps the description to a workflow info object and returns the raw description', async () => {
    const describeFn = vi.fn().mockResolvedValue( baseDescription );

    const result = await describeWorkflow( makeContext( describeFn ), 'wf-1', { runId: 'run-1' } );

    expect( result.workflow ).toEqual( {
      workflowId: 'wf-1',
      runId: 'run-1',
      status: 'formatted:RUNNING',
      startTime: '2024-01-01T00:00:00.000Z',
      closeTime: null,
      historyLength: 7,
      taskQueue: 'queue-a'
    } );
    expect( result.description ).toBe( baseDescription );
  } );

  it( 'translates gRPC NOT_FOUND into a run-aware WorkflowNotFoundError', async () => {
    const notFound = Object.assign( new Error( 'nope' ), { code: 5 } );

    await expect( describeWorkflow( makeContext( vi.fn().mockRejectedValue( notFound ) ), 'wf-x', { runId: 'r' } ) )
      .rejects.toMatchObject( {
        name: 'WorkflowNotFoundError',
        message: 'Run "r" not found for workflow "wf-x"',
        workflowId: 'wf-x'
      } );
  } );

  it( 'rethrows a cancellation bare and annotates other errors with workflowId', async () => {
    const cancelled = Object.assign( new Error( 'cancel' ), { _cancelled: true } );
    await expect( describeWorkflow( makeContext( vi.fn().mockRejectedValue( cancelled ) ), 'wf-1' ) )
      .rejects.toBe( cancelled );

    const boom = new Error( 'boom' );
    await expect( describeWorkflow( makeContext( vi.fn().mockRejectedValue( boom ) ), 'wf-1' ) )
      .rejects.toMatchObject( { message: 'boom', workflowId: 'wf-1' } );
  } );

  it( 'runs the describe call through the provided invoke wrapper', async () => {
    const describeFn = vi.fn().mockResolvedValue( baseDescription );
    const invoke = vi.fn( fn => fn() );

    await describeWorkflow( makeContext( describeFn ), 'wf-1', { runId: 'run-1', invoke } );

    expect( invoke ).toHaveBeenCalledWith( expect.any( Function ) );
    expect( describeFn ).toHaveBeenCalled();
  } );
} );
