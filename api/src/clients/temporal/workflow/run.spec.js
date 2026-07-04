import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkflowExecutionTimedOutError } from '../../errors.js';

const {
  mockBuildWorkflowId,
  mockBuildWorkflowResult,
  mockResolveWorkflowName,
  mockLoggerWarn,
  MockWorkflowFailedError
} = vi.hoisted( () => {
  class MockWorkflowFailedError extends Error {}

  return {
    mockBuildWorkflowId: vi.fn(),
    mockBuildWorkflowResult: vi.fn(),
    mockResolveWorkflowName: vi.fn(),
    mockLoggerWarn: vi.fn(),
    MockWorkflowFailedError
  };
} );

vi.mock( '#configs', () => ( {
  temporal: {
    defaultTaskQueue: 'default-queue',
    workflowExecutionTimeout: 60_000,
    workflowExecutionMaxWaiting: 30_000
  }
} ) );

vi.mock( '#utils', () => ( {
  buildWorkflowId: mockBuildWorkflowId
} ) );

vi.mock( '#logger', () => ( {
  logger: { warn: mockLoggerWarn }
} ) );

vi.mock( '../../errors.js', async importOriginal => ( {
  ...( await importOriginal() ),
  WorkflowFailedError: MockWorkflowFailedError
} ) );

vi.mock( '../catalog.js', () => ( {
  resolveWorkflowName: mockResolveWorkflowName
} ) );

vi.mock( '../workflow_result.js', () => ( {
  buildWorkflowResult: mockBuildWorkflowResult
} ) );

describe( 'run', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mockBuildWorkflowId.mockReturnValue( 'generated-id' );
    mockResolveWorkflowName.mockResolvedValue( 'resolved-workflow' );
    mockBuildWorkflowResult.mockImplementation( args => ( { shaped: args } ) );
  } );

  afterEach( () => {
    vi.useRealTimers();
  } );

  it( 'starts the resolved workflow and returns a completed workflow result', async () => {
    const workflowResult = { output: { ok: true } };
    const handle = { firstExecutionRunId: 'run-1', result: vi.fn().mockResolvedValue( workflowResult ) };
    const start = vi.fn().mockResolvedValue( handle );
    const client = { workflow: { start } };
    const { run } = await import( './run.js' );

    const result = await run( { client }, 'alias-name', { input: true } );

    expect( mockResolveWorkflowName ).toHaveBeenCalledWith( {
      client,
      workflowName: 'alias-name',
      taskQueue: 'default-queue'
    } );
    expect( start ).toHaveBeenCalledWith( 'resolved-workflow', {
      args: [ { input: true } ],
      taskQueue: 'default-queue',
      workflowId: 'generated-id',
      workflowExecutionTimeout: 60_000
    } );
    expect( mockBuildWorkflowResult ).toHaveBeenCalledWith( {
      workflowId: 'generated-id',
      status: 'completed',
      runId: 'run-1',
      input: { input: true },
      result: workflowResult
    } );
    expect( result ).toEqual( { shaped: mockBuildWorkflowResult.mock.calls[0][0] } );
  } );

  it( 'uses caller-provided workflow id, task queue, and wait timeout', async () => {
    const handle = { result: vi.fn().mockResolvedValue( { output: null } ) };
    const start = vi.fn().mockResolvedValue( handle );
    const client = { workflow: { start } };
    const { run } = await import( './run.js' );

    await run( { client }, 'workflow', 'input', { workflowId: 'provided-id', taskQueue: 'custom-queue', timeout: 1_000 } );

    expect( mockBuildWorkflowId ).not.toHaveBeenCalled();
    expect( mockResolveWorkflowName ).toHaveBeenCalledWith( {
      client,
      workflowName: 'workflow',
      taskQueue: 'custom-queue'
    } );
    expect( start ).toHaveBeenCalledWith( 'resolved-workflow', expect.objectContaining( {
      taskQueue: 'custom-queue',
      workflowId: 'provided-id'
    } ) );
    expect( mockBuildWorkflowResult ).toHaveBeenCalledWith( expect.objectContaining( {
      workflowId: 'provided-id',
      runId: null
    } ) );
  } );

  it( 'returns failed workflow results instead of throwing WorkflowFailedError', async () => {
    const workflowError = new MockWorkflowFailedError( 'workflow failed' );
    const handle = { firstExecutionRunId: 'run-failed', result: vi.fn().mockRejectedValue( workflowError ) };
    const start = vi.fn().mockResolvedValue( handle );
    const client = { workflow: { start } };
    const { run } = await import( './run.js' );

    await run( { client }, 'workflow', { input: true } );

    expect( mockLoggerWarn ).toHaveBeenCalledWith( 'Workflow execution failed', {
      workflowId: 'generated-id',
      errorMessage: 'workflow failed'
    } );
    expect( mockBuildWorkflowResult ).toHaveBeenCalledWith( {
      workflowId: 'generated-id',
      status: 'failed',
      runId: 'run-failed',
      input: { input: true },
      error: workflowError
    } );
  } );

  it( 'annotates and rethrows non-workflow-failure errors', async () => {
    const error = new Error( 'connection lost' );
    const handle = { firstExecutionRunId: 'run-2', result: vi.fn().mockRejectedValue( error ) };
    const start = vi.fn().mockResolvedValue( handle );
    const client = { workflow: { start } };
    const { run } = await import( './run.js' );

    await expect( run( { client }, 'workflow', {} ) ).rejects.toBe( error );
    expect( error.workflowId ).toBe( 'generated-id' );
    expect( error.runId ).toBe( 'run-2' );
  } );

  it( 'rejects with WorkflowExecutionTimedOutError when the wait timeout elapses', async () => {
    vi.useFakeTimers();
    const handle = { firstExecutionRunId: 'run-timeout', result: vi.fn( () => new Promise( () => {} ) ) };
    const start = vi.fn().mockResolvedValue( handle );
    const client = { workflow: { start } };
    const { run } = await import( './run.js' );

    const promise = run( { client }, 'workflow', {}, { timeout: 50 } );
    const expectation = expect( promise ).rejects.toBeInstanceOf( WorkflowExecutionTimedOutError );
    await vi.advanceTimersByTimeAsync( 50 );

    await expectation;
  } );
} );
