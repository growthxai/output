import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowNotCompletedError, WorkflowExecutionTimedOutError, StepNotFoundError, StepNotCompletedError } from './errors.js';
import { resolveResetEventId, extractWorkflowInput } from './temporal_client.js';

const {
  mockDescribe,
  mockResult,
  mockQuery,
  mockStart,
  mockGetHandle,
  mockConnect,
  mockFetchHistory,
  mockLoggerInfo,
  mockLoggerError,
  mockLoggerWarn,
  MockWorkflowFailedError
} = vi.hoisted( () => {
  const mockDescribe = vi.fn();
  const mockResult = vi.fn();
  const mockQuery = vi.fn();
  const mockStart = vi.fn();
  const mockGetHandle = vi.fn();
  const mockConnect = vi.fn();
  const mockFetchHistory = vi.fn();
  const mockLoggerInfo = vi.fn();
  const mockLoggerError = vi.fn();
  const mockLoggerWarn = vi.fn();

  class MockWorkflowFailedError extends Error {
    constructor( message, opts = {} ) {
      super( message );
      this.name = 'WorkflowFailedError';
      this.cause = opts.cause;
      this.details = opts.details;
    }
  }

  return {
    mockDescribe,
    mockResult,
    mockQuery,
    mockStart,
    mockGetHandle,
    mockConnect,
    mockFetchHistory,
    mockLoggerInfo,
    mockLoggerError,
    mockLoggerWarn,
    MockWorkflowFailedError
  };
} );

vi.mock( '@temporalio/client', () => ( {
  Client: vi.fn().mockImplementation( function () {
    return {
      workflow: {
        getHandle: mockGetHandle,
        start: mockStart
      }
    };
  } ),
  Connection: {
    connect: mockConnect
  },
  defaultPayloadConverter: {
    fromPayload: vi.fn( p => p )
  },
  WorkflowNotFoundError: class WorkflowNotFoundError extends Error {
    constructor( message ) {
      super( message );
      this.name = 'WorkflowNotFoundError';
    }
  },
  WorkflowFailedError: MockWorkflowFailedError
} ) );

vi.mock( '#configs', () => ( {
  temporal: {
    address: 'localhost:7233',
    apiKey: null,
    namespace: 'default',
    defaultTaskQueue: 'test-queue',
    workflowExecutionTimeout: 60000,
    workflowExecutionMaxWaiting: 30000
  }
} ) );

vi.mock( '#logger', () => ( {
  logger: {
    info: mockLoggerInfo,
    error: mockLoggerError,
    warn: mockLoggerWarn
  }
} ) );

const walkCause = e => e?.cause ? walkCause( e.cause ) : ( e?.message ?? null );

vi.mock( '#utils', () => ( {
  buildWorkflowId: vi.fn( () => 'test-uuid' ),
  extractTraceInfo: vi.fn( e => e?.details?.find?.( d => d.trace )?.trace ),
  extractErrorMessage: vi.fn( e => walkCause( e ) )
} ) );

describe( 'temporal_client', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue( {} );
    mockFetchHistory.mockResolvedValue( { events: [] } );
    mockGetHandle.mockReturnValue( {
      describe: mockDescribe,
      result: mockResult,
      query: mockQuery,
      fetchHistory: mockFetchHistory
    } );
  } );

  describe( 'WorkflowNotCompletedError', () => {
    it( 'should create error with correct message', () => {
      const error = new WorkflowNotCompletedError();
      expect( error.message ).toBe( 'Workflow execution is not complete.' );
      expect( error instanceof Error ).toBe( true );
    } );
  } );

  describe( 'WorkflowExecutionTimedOutError', () => {
    it( 'should create error with correct message', () => {
      const error = new WorkflowExecutionTimedOutError();
      expect( error.message ).toBe( 'Workflow execution exceeded timeout for synchronous execution.' );
      expect( error instanceof Error ).toBe( true );
    } );
  } );

  describe( 'runWorkflow', () => {
    it( 'should return failed status with trace and deepest error message from cause chain', async () => {
      const tracePayload = { destinations: { local: '/tmp/trace.json' } };
      const workflowError = new MockWorkflowFailedError( 'Workflow execution failed', {
        details: [ { trace: tracePayload } ],
        cause: { message: 'Activity task failed', cause: { message: 'step error message' } }
      } );

      mockQuery.mockResolvedValue( { workflows: [ { name: 'test-workflow' } ] } );
      mockStart.mockResolvedValue( {
        firstExecutionRunId: 'run-aaa',
        result: () => Promise.reject( workflowError )
      } );
      mockGetHandle
        .mockReturnValueOnce( { query: mockQuery } )
        .mockReturnValue( { result: () => Promise.reject( workflowError ) } );

      const temporalClient = ( await import( './temporal_client.js' ) ).default;
      const client = await temporalClient.init();
      const result = await client.runWorkflow( 'test-workflow', { input: 'data' } );

      expect( result ).toEqual( {
        workflowId: 'test-uuid',
        runId: 'run-aaa',
        status: 'failed',
        input: null,
        output: null,
        trace: tracePayload,
        error: 'step error message'
      } );
      expect( mockLoggerWarn ).toHaveBeenCalledWith( 'Workflow execution failed', expect.objectContaining( {
        workflowId: 'test-uuid',
        errorMessage: 'Workflow execution failed'
      } ) );
    } );

    it( 'should return completed status with output on success', async () => {
      const successResult = { output: { data: 'result' }, trace: { local: '/tmp/trace.json' } };

      mockQuery.mockResolvedValue( { workflows: [ { name: 'test-workflow' } ] } );
      mockStart.mockResolvedValue( {
        firstExecutionRunId: 'run-aaa',
        result: () => Promise.resolve( successResult )
      } );
      mockGetHandle
        .mockReturnValueOnce( { query: mockQuery } )
        .mockReturnValue( { result: () => Promise.resolve( successResult ) } );

      const temporalClient = ( await import( './temporal_client.js' ) ).default;
      const client = await temporalClient.init();
      const result = await client.runWorkflow( 'test-workflow', { input: 'data' } );

      expect( result ).toEqual( {
        workflowId: 'test-uuid',
        runId: 'run-aaa',
        status: 'completed',
        input: null,
        output: { data: 'result' },
        trace: { local: '/tmp/trace.json' },
        error: null
      } );
    } );

    it( 'should resolve alias to primary workflow name', async () => {
      const successResult = { output: { data: 'aliased' }, trace: null };

      mockQuery.mockResolvedValue( {
        workflows: [ { name: 'new_name', aliases: [ 'old_name' ] } ]
      } );
      mockStart.mockResolvedValue( {
        firstExecutionRunId: 'run-aaa',
        result: () => Promise.resolve( successResult )
      } );
      mockGetHandle
        .mockReturnValueOnce( { query: mockQuery } )
        .mockReturnValue( { result: () => Promise.resolve( successResult ) } );

      const temporalClient = ( await import( './temporal_client.js' ) ).default;
      const client = await temporalClient.init();
      const result = await client.runWorkflow( 'old_name', { input: 'data' } );

      expect( result.status ).toBe( 'completed' );
      expect( result.output ).toEqual( { data: 'aliased' } );
      // Verify the resolved primary name was used for Temporal start
      expect( mockStart ).toHaveBeenCalledWith( 'new_name', expect.objectContaining( {
        args: [ { input: 'data' } ]
      } ) );
    } );

    it( 'should log when alias is resolved', async () => {
      const successResult = { output: {}, trace: null };

      mockQuery.mockResolvedValue( {
        workflows: [ { name: 'new_name', aliases: [ 'old_name' ] } ]
      } );
      mockStart.mockResolvedValue( {
        firstExecutionRunId: 'run-aaa',
        result: () => Promise.resolve( successResult )
      } );
      mockGetHandle
        .mockReturnValueOnce( { query: mockQuery } )
        .mockReturnValue( { result: () => Promise.resolve( successResult ) } );

      const temporalClient = ( await import( './temporal_client.js' ) ).default;
      const client = await temporalClient.init();
      await client.runWorkflow( 'old_name', {} );

      expect( mockLoggerInfo ).toHaveBeenCalledWith( 'Workflow alias resolved', {
        alias: 'old_name',
        resolvedName: 'new_name',
        taskQueue: 'test-queue'
      } );
    } );

    it( 'should throw non-WorkflowFailedError errors', async () => {
      const timeoutError = new WorkflowExecutionTimedOutError();

      mockQuery.mockResolvedValue( { workflows: [ { name: 'test-workflow' } ] } );
      mockStart.mockResolvedValue( {
        result: () => Promise.reject( timeoutError )
      } );
      mockGetHandle
        .mockReturnValueOnce( { query: mockQuery } )
        .mockReturnValue( { result: () => Promise.reject( timeoutError ) } );

      const temporalClient = ( await import( './temporal_client.js' ) ).default;
      const client = await temporalClient.init();

      await expect( client.runWorkflow( 'test-workflow', { input: 'data' } ) )
        .rejects
        .toThrow( WorkflowExecutionTimedOutError );
    } );
  } );

  describe( 'startWorkflow', () => {
    it( 'should resolve alias to primary workflow name', async () => {
      mockQuery.mockResolvedValue( {
        workflows: [ { name: 'new_name', aliases: [ 'old_name' ] } ]
      } );
      mockStart.mockResolvedValue( { firstExecutionRunId: 'run-bbb' } );
      mockGetHandle.mockReturnValue( { query: mockQuery } );

      const temporalClient = ( await import( './temporal_client.js' ) ).default;
      const client = await temporalClient.init();
      const result = await client.startWorkflow( 'old_name', { input: 'data' } );

      expect( result.workflowId ).toBe( 'test-uuid' );
      expect( result.runId ).toBe( 'run-bbb' );
      expect( mockStart ).toHaveBeenCalledWith( 'new_name', expect.objectContaining( {
        args: [ { input: 'data' } ]
      } ) );
      expect( mockLoggerInfo ).toHaveBeenCalledWith( 'Workflow alias resolved', {
        alias: 'old_name',
        resolvedName: 'new_name',
        taskQueue: 'test-queue'
      } );
    } );
  } );

  describe( 'getWorkflowResult', () => {
    it( 'should throw WorkflowNotCompletedError for running workflows', async () => {
      mockDescribe.mockResolvedValue( {
        status: { code: 1, name: 'RUNNING' }
      } );

      const temporalClient = ( await import( './temporal_client.js' ) ).default;
      const client = await temporalClient.init();

      await expect( client.getWorkflowResult( 'workflow-123' ) )
        .rejects
        .toThrow( WorkflowNotCompletedError );
    } );

    it( 'should return completed workflow with output and trace', async () => {
      const workflowOutput = { output: { data: 'result' }, trace: { local: '/tmp/trace.json' } };

      mockDescribe.mockResolvedValue( {
        status: { code: 2, name: 'COMPLETED' },
        runId: 'run-completed'
      } );
      mockResult.mockResolvedValue( workflowOutput );

      const temporalClient = ( await import( './temporal_client.js' ) ).default;
      const client = await temporalClient.init();
      const result = await client.getWorkflowResult( 'workflow-123' );

      expect( result ).toEqual( {
        workflowId: 'workflow-123',
        runId: 'run-completed',
        status: 'completed',
        input: null,
        output: { data: 'result' },
        trace: { local: '/tmp/trace.json' },
        error: null
      } );
    } );

    it( 'should forward runId to getHandle when provided', async () => {
      mockDescribe.mockResolvedValue( {
        status: { code: 2, name: 'COMPLETED' },
        runId: 'run-explicit'
      } );
      mockResult.mockResolvedValue( { output: null, trace: null } );

      const temporalClient = ( await import( './temporal_client.js' ) ).default;
      const client = await temporalClient.init();
      await client.getWorkflowResult( 'workflow-123', 'run-explicit' );

      expect( mockGetHandle ).toHaveBeenCalledWith( 'workflow-123', 'run-explicit' );
    } );

    it( 'should pass undefined runId to getHandle when not provided', async () => {
      mockDescribe.mockResolvedValue( {
        status: { code: 2, name: 'COMPLETED' },
        runId: 'run-latest'
      } );
      mockResult.mockResolvedValue( { output: null, trace: null } );

      const temporalClient = ( await import( './temporal_client.js' ) ).default;
      const client = await temporalClient.init();
      await client.getWorkflowResult( 'workflow-123' );

      expect( mockGetHandle ).toHaveBeenCalledWith( 'workflow-123', undefined );
    } );

    it( 'should pin handle to resolved runId after describe when runId was not provided', async () => {
      mockDescribe.mockResolvedValue( {
        status: { code: 2, name: 'COMPLETED' },
        runId: 'run-latest'
      } );
      mockResult.mockResolvedValue( { output: null, trace: null } );

      const temporalClient = ( await import( './temporal_client.js' ) ).default;
      const client = await temporalClient.init();
      await client.getWorkflowResult( 'workflow-123' );

      expect( mockGetHandle ).toHaveBeenNthCalledWith( 1, 'workflow-123', undefined );
      expect( mockGetHandle ).toHaveBeenNthCalledWith( 2, 'workflow-123', 'run-latest' );
    } );

    it( 'should not re-pin handle when runId was provided', async () => {
      mockDescribe.mockResolvedValue( {
        status: { code: 2, name: 'COMPLETED' },
        runId: 'run-explicit'
      } );
      mockResult.mockResolvedValue( { output: null, trace: null } );

      const temporalClient = ( await import( './temporal_client.js' ) ).default;
      const client = await temporalClient.init();
      await client.getWorkflowResult( 'workflow-123', 'run-explicit' );

      expect( mockGetHandle ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'should return failed workflow with deepest error message and trace from WorkflowFailedError', async () => {
      const tracePayload = { destinations: { local: '/tmp/trace.json' } };
      const workflowError = new MockWorkflowFailedError( 'Workflow execution failed', {
        details: [ { trace: tracePayload } ],
        cause: { message: 'Activity task failed', cause: { message: 'step error message' } }
      } );

      mockDescribe.mockResolvedValue( {
        status: { code: 3, name: 'FAILED' },
        runId: 'run-failed'
      } );
      mockResult.mockRejectedValue( workflowError );

      const temporalClient = ( await import( './temporal_client.js' ) ).default;
      const client = await temporalClient.init();
      const result = await client.getWorkflowResult( 'workflow-123' );

      expect( result ).toEqual( {
        workflowId: 'workflow-123',
        runId: 'run-failed',
        status: 'failed',
        input: null,
        output: null,
        trace: tracePayload,
        error: 'step error message'
      } );
    } );

    it( 'should throw unexpected errors instead of masking them as workflow failures', async () => {
      const connectionError = new Error( 'Connection refused' );

      mockDescribe.mockResolvedValue( {
        status: { code: 3, name: 'FAILED' }
      } );
      mockResult.mockRejectedValue( connectionError );

      const temporalClient = ( await import( './temporal_client.js' ) ).default;
      const client = await temporalClient.init();

      await expect( client.getWorkflowResult( 'workflow-123' ) )
        .rejects
        .toThrow( 'Connection refused' );

      expect( mockLoggerError ).toHaveBeenCalledWith(
        'Unexpected error fetching workflow result',
        expect.objectContaining( {
          workflowId: 'workflow-123',
          status: 'failed',
          message: 'Connection refused'
        } )
      );
    } );

    it( 'should return continued status for CONTINUED_AS_NEW workflows', async () => {
      mockDescribe.mockResolvedValue( {
        status: { code: 6, name: 'CONTINUED_AS_NEW' },
        runId: 'run-continued'
      } );

      const temporalClient = ( await import( './temporal_client.js' ) ).default;
      const client = await temporalClient.init();
      const result = await client.getWorkflowResult( 'workflow-123' );

      expect( result ).toEqual( {
        workflowId: 'workflow-123',
        runId: 'run-continued',
        status: 'continued',
        input: null,
        output: null,
        trace: null,
        error: null
      } );
    } );

    it( 'should return canceled status for canceled workflows', async () => {
      const cancelError = new MockWorkflowFailedError( 'Workflow canceled' );

      mockDescribe.mockResolvedValue( {
        status: { code: 4, name: 'CANCELED' }
      } );
      mockResult.mockRejectedValue( cancelError );

      const temporalClient = ( await import( './temporal_client.js' ) ).default;
      const client = await temporalClient.init();
      const result = await client.getWorkflowResult( 'workflow-123' );

      expect( result.status ).toBe( 'canceled' );
      expect( result.error ).toBe( 'Workflow canceled' ); // no cause chain, falls back to message
    } );

    it( 'should return terminated status for terminated workflows', async () => {
      const terminateError = new MockWorkflowFailedError( 'Workflow terminated' );

      mockDescribe.mockResolvedValue( {
        status: { code: 5, name: 'TERMINATED' }
      } );
      mockResult.mockRejectedValue( terminateError );

      const temporalClient = ( await import( './temporal_client.js' ) ).default;
      const client = await temporalClient.init();
      const result = await client.getWorkflowResult( 'workflow-123' );

      expect( result.status ).toBe( 'terminated' );
      expect( result.error ).toBe( 'Workflow terminated' );
    } );

    it( 'should return timed_out status for timed out workflows', async () => {
      const timeoutError = new MockWorkflowFailedError( 'Workflow timed out' );

      mockDescribe.mockResolvedValue( {
        status: { code: 7, name: 'TIMED_OUT' }
      } );
      mockResult.mockRejectedValue( timeoutError );

      const temporalClient = ( await import( './temporal_client.js' ) ).default;
      const client = await temporalClient.init();
      const result = await client.getWorkflowResult( 'workflow-123' );

      expect( result.status ).toBe( 'timed_out' );
      expect( result.error ).toBe( 'Workflow timed out' );
    } );

    it( 'should include workflow input from history when available', async () => {
      const workflowInput = { url: 'https://example.com', options: { depth: 2 } };

      mockDescribe.mockResolvedValue( {
        status: { code: 2, name: 'COMPLETED' },
        runId: 'run-input'
      } );
      mockResult.mockResolvedValue( { output: { data: 'result' }, trace: null } );
      mockFetchHistory.mockResolvedValue( {
        events: [ {
          workflowExecutionStartedEventAttributes: {
            input: { payloads: [ workflowInput ] }
          }
        } ]
      } );

      const temporalClient = ( await import( './temporal_client.js' ) ).default;
      const client = await temporalClient.init();
      const result = await client.getWorkflowResult( 'workflow-123' );

      expect( result.input ).toEqual( workflowInput );
    } );
  } );

  describe( 'extractWorkflowInput', () => {
    it( 'returns null when history has no events', () => {
      expect( extractWorkflowInput( { events: [] } ) ).toBeNull();
    } );

    it( 'returns null when history is null', () => {
      expect( extractWorkflowInput( null ) ).toBeNull();
    } );

    it( 'returns null when payloads are empty', () => {
      expect( extractWorkflowInput( {
        events: [ { workflowExecutionStartedEventAttributes: { input: { payloads: [] } } } ]
      } ) ).toBeNull();
    } );

    it( 'returns null when input attributes are missing', () => {
      expect( extractWorkflowInput( {
        events: [ { workflowExecutionStartedEventAttributes: {} } ]
      } ) ).toBeNull();
    } );

    it( 'returns decoded payload when present', () => {
      const payload = { values: [ 1, 2, 3 ] };
      expect( extractWorkflowInput( {
        events: [ {
          workflowExecutionStartedEventAttributes: {
            input: { payloads: [ payload ] }
          }
        } ]
      } ) ).toEqual( payload );
    } );
  } );

  describe( 'resolveResetEventId', () => {
    const makeEvent = ( eventId, eventType, attrs = {} ) => ( {
      eventId: { toString: () => String( eventId ) },
      eventType,
      ...attrs
    } );

    // Realistic workflow history: start -> generatePost -> editPost -> complete
    // Event types: 5=WF_TASK_SCHEDULED, 6=WF_TASK_STARTED, 7=WF_TASK_COMPLETED,
    // 10=ACTIVITY_SCHEDULED, 11=ACTIVITY_STARTED, 12=ACTIVITY_COMPLETED
    const buildHistory = () => [
      makeEvent( 1, 1 ),
      makeEvent( 2, 5 ),
      makeEvent( 3, 6 ),
      makeEvent( 4, 7 ),
      makeEvent( 5, 10, {
        activityTaskScheduledEventAttributes: { activityType: { name: 'blog_generator#generatePost' } }
      } ),
      makeEvent( 6, 11 ),
      makeEvent( 7, 12, {
        activityTaskCompletedEventAttributes: { scheduledEventId: { toString: () => '5' } }
      } ),
      makeEvent( 8, 5 ),
      makeEvent( 9, 6 ),
      makeEvent( 10, 7 ), // reset target for generatePost
      makeEvent( 11, 10, {
        activityTaskScheduledEventAttributes: { activityType: { name: 'blog_generator#editPost' } }
      } ),
      makeEvent( 12, 11 ),
      makeEvent( 13, 12, {
        activityTaskCompletedEventAttributes: { scheduledEventId: { toString: () => '11' } }
      } ),
      makeEvent( 14, 5 ),
      makeEvent( 15, 6 ),
      makeEvent( 16, 7 ),
      makeEvent( 17, 8 )
    ];

    it( 'returns the WORKFLOW_TASK_COMPLETED event ID after the matched step', () => {
      const events = buildHistory();
      const result = resolveResetEventId( events, 'generatePost' );
      expect( result.toString() ).toBe( '10' );
    } );

    it( 'resolves the correct event for a later step', () => {
      const events = buildHistory();
      const result = resolveResetEventId( events, 'editPost' );
      expect( result.toString() ).toBe( '16' );
    } );

    it( 'throws StepNotFoundError when step does not exist', () => {
      const events = buildHistory();
      expect( () => resolveResetEventId( events, 'nonExistentStep' ) ).toThrow( StepNotFoundError );
    } );

    it( 'throws StepNotCompletedError when step was scheduled but not completed', () => {
      // History with a scheduled activity that never completed
      const events = [
        makeEvent( 1, 1 ),
        makeEvent( 2, 5 ),
        makeEvent( 3, 6 ),
        makeEvent( 4, 7 ),
        makeEvent( 5, 10, {
          activityTaskScheduledEventAttributes: { activityType: { name: 'wf#myStep' } }
        } ),
        makeEvent( 6, 11 ) // ACTIVITY_TASK_STARTED but no COMPLETED
      ];
      expect( () => resolveResetEventId( events, 'myStep' ) ).toThrow( StepNotCompletedError );
    } );

    it( 'uses the last occurrence when a step appears multiple times (retries)', () => {
      const events = [
        makeEvent( 1, 1 ),
        makeEvent( 2, 5 ),
        makeEvent( 3, 6 ),
        makeEvent( 4, 7 ),
        // First execution of step
        makeEvent( 5, 10, {
          activityTaskScheduledEventAttributes: { activityType: { name: 'wf#retryStep' } }
        } ),
        makeEvent( 6, 11 ),
        makeEvent( 7, 12, {
          activityTaskCompletedEventAttributes: { scheduledEventId: { toString: () => '5' } }
        } ),
        makeEvent( 8, 5 ),
        makeEvent( 9, 6 ),
        makeEvent( 10, 7 ),
        // Second execution of same step (loop/retry)
        makeEvent( 11, 10, {
          activityTaskScheduledEventAttributes: { activityType: { name: 'wf#retryStep' } }
        } ),
        makeEvent( 12, 11 ),
        makeEvent( 13, 12, {
          activityTaskCompletedEventAttributes: { scheduledEventId: { toString: () => '11' } }
        } ),
        makeEvent( 14, 5 ),
        makeEvent( 15, 6 ),
        makeEvent( 16, 7 )
      ];

      const result = resolveResetEventId( events, 'retryStep' );
      // Should resolve to event 16 (after the second/last execution), not event 10
      expect( result.toString() ).toBe( '16' );
    } );

    it( 'matches shared steps with $shared prefix', () => {
      const events = [
        makeEvent( 1, 1 ),
        makeEvent( 2, 5 ),
        makeEvent( 3, 6 ),
        makeEvent( 4, 7 ),
        makeEvent( 5, 10, {
          activityTaskScheduledEventAttributes: { activityType: { name: '$shared#commonStep' } }
        } ),
        makeEvent( 6, 11 ),
        makeEvent( 7, 12, {
          activityTaskCompletedEventAttributes: { scheduledEventId: { toString: () => '5' } }
        } ),
        makeEvent( 8, 5 ),
        makeEvent( 9, 6 ),
        makeEvent( 10, 7 )
      ];

      const result = resolveResetEventId( events, 'commonStep' );
      expect( result.toString() ).toBe( '10' );
    } );
  } );
} );
