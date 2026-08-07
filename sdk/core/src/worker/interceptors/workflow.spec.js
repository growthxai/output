import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApplicationFailure } from '@temporalio/common';
import { FatalError, TransparentFatalError, ValidationError } from '#errors';

const workflowInfoMock = vi.fn();
const workflowStartMock = vi.fn();
const workflowEndMock = vi.fn();
const workflowErrorMock = vi.fn();
const isCancellationMock = vi.fn();
const upsertMemoMock = vi.fn();
const traceInfoBuildMock = vi.fn();
const startTime = new Date( '2026-06-02T09:00:00.000Z' );
const runStartTime = new Date( '2026-06-02T09:05:00.000Z' );
const workflowDetails = {
  attempt: 1,
  continuedFromExecutionRunId: undefined,
  firstExecutionRunId: 'first-run',
  parent: undefined,
  root: undefined,
  runId: 'run-1',
  runStartTime: runStartTime.getTime(),
  startTime: startTime.getTime(),
  workflowId: 'workflow-1',
  workflowType: 'MyWorkflow'
};

const workflowInfo = {
  attempt: 1,
  continuedFromExecutionRunId: undefined,
  firstExecutionRunId: 'first-run',
  parent: undefined,
  root: undefined,
  runId: 'run-1',
  runStartTime,
  startTime,
  workflowId: 'workflow-1',
  workflowType: 'MyWorkflow',
  memo: { traceInfo: { runId: 'root-run' } }
};

vi.mock( '@temporalio/workflow', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    workflowInfo: ( ...args ) => workflowInfoMock( ...args ),
    proxySinks: () => ( {
      workflow: { start: workflowStartMock, end: workflowEndMock, error: workflowErrorMock }
    } ),
    ContinueAsNew: class ContinueAsNew extends Error {
      constructor() {
        super( 'ContinueAsNew' );
        this.name = 'ContinueAsNew';
      }
    },
    isCancellation: ( ...args ) => isCancellationMock( ...args ),
    upsertMemo: ( ...args ) => upsertMemoMock( ...args )
  };
} );

vi.mock( '#helpers/trace_info', () => ( { TraceInfo: { build: ( ...args ) => traceInfoBuildMock( ...args ) } } ) );

const memoToHeadersMock = vi.fn( memo => ( memo ? { ...memo, __asHeaders: true } : {} ) );
vi.mock( './headers.js', () => ( { memoToHeaders: ( ...args ) => memoToHeadersMock( ...args ) } ) );

const deepMergeMock = vi.fn( ( a, b ) => ( { ...( a || {} ), ...( b || {} ) } ) );
vi.mock( '#helpers/object', () => ( { deepMerge: ( ...args ) => deepMergeMock( ...args ) } ) );

const activityOptionsDefault = {};
vi.mock( '../temp/__activity_options.js', () => ( { default: activityOptionsDefault } ) );

const workflowOptionsDefault = {};
vi.mock( '../temp/__workflow_options.js', () => ( { default: workflowOptionsDefault } ) );

describe( 'workflow interceptors', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    Object.keys( activityOptionsDefault ).forEach( key => delete activityOptionsDefault[key] );
    Object.keys( workflowOptionsDefault ).forEach( key => delete workflowOptionsDefault[key] );
    workflowOptionsDefault.MyWorkflow = { disableTrace: false };
    isCancellationMock.mockReturnValue( false );
    traceInfoBuildMock.mockReturnValue( { workflowId: 'workflow-1', runId: 'run-1' } );
    workflowInfoMock.mockReturnValue( workflowInfo );
  } );

  describe( 'HeadersInjectionInterceptor', () => {
    it( 'assigns memo as headers via memoToHeaders and calls next', async () => {
      const { interceptors } = await import( './workflow.js' );
      const { outbound } = interceptors();
      const interceptor = outbound[0];
      const input = { headers: { existing: 'header' }, activityType: 'MyWorkflow#step1', options: {} };
      const next = vi.fn().mockResolvedValue( 'result' );

      memoToHeadersMock.mockReturnValue( { traceInfo: workflowInfo.memo.traceInfo, workflowDetails } );

      const out = await interceptor.scheduleActivity( input, next );

      expect( memoToHeadersMock ).toHaveBeenCalledWith( {
        traceInfo: workflowInfo.memo.traceInfo,
        workflowDetails
      } );
      expect( input.headers ).toEqual( {
        existing: 'header',
        traceInfo: workflowInfo.memo.traceInfo,
        workflowDetails
      } );
      expect( next ).toHaveBeenCalledWith( input );
      expect( out ).toBe( 'result' );
    } );

    it( 'merges component activity options over the scheduled activity input options', async () => {
      activityOptionsDefault['MyWorkflow#step1'] = { scheduleToCloseTimeout: 60 };
      workflowInfoMock.mockReturnValue( {
        ...workflowInfo,
        memo: { traceInfo: workflowInfo.memo.traceInfo }
      } );
      memoToHeadersMock.mockReturnValue( {} );
      deepMergeMock.mockReturnValue( {
        heartbeatTimeout: 10,
        scheduleToCloseTimeout: 60,
        retry: { maximumAttempts: 2, nonRetryableErrorTypes: [ 'StepError' ] }
      } );

      const { interceptors } = await import( './workflow.js' );
      const { outbound } = interceptors();
      const interceptor = outbound[0];
      const input = { headers: {}, activityType: 'MyWorkflow#step1', options: { heartbeatTimeout: 10 } };
      const next = vi.fn().mockResolvedValue( undefined );

      await interceptor.scheduleActivity( input, next );

      expect( deepMergeMock ).toHaveBeenCalledWith( { heartbeatTimeout: 10 }, { scheduleToCloseTimeout: 60 } );
      expect( input.options ).toEqual( {
        heartbeatTimeout: 10,
        scheduleToCloseTimeout: 60,
        retry: {
          maximumAttempts: 2,
          nonRetryableErrorTypes: [ 'StepError', 'FatalError' ]
        }
      } );
    } );

    it( 'adds FatalError to activity retry options without duplicates', async () => {
      const { interceptors } = await import( './workflow.js' );
      const { outbound } = interceptors();
      const interceptor = outbound[0];
      const input = {
        headers: {},
        activityType: 'MyWorkflow#step1',
        options: {
          retry: {
            maximumAttempts: 4,
            nonRetryableErrorTypes: [ 'DomainError', 'FatalError' ]
          }
        }
      };
      const next = vi.fn().mockResolvedValue( undefined );

      await interceptor.scheduleActivity( input, next );

      expect( input.options.retry ).toEqual( {
        maximumAttempts: 4,
        nonRetryableErrorTypes: [ 'DomainError', 'FatalError' ]
      } );
    } );
  } );

  describe( 'WorkflowExecutionInterceptor', () => {
    it( 'upserts root trace info before starting the workflow trace', async () => {
      const { interceptors } = await import( './workflow.js' );
      const { inbound } = interceptors();
      const traceInfo = { workflowId: 'workflow-1', runId: 'run-1' };
      traceInfoBuildMock.mockReturnValue( traceInfo );

      await inbound[0].execute( { args: [ {} ] }, vi.fn().mockResolvedValue( undefined ) );

      expect( traceInfoBuildMock ).toHaveBeenCalledOnce();
      expect( upsertMemoMock ).toHaveBeenCalledWith( { payloadVersion: '2', traceInfo } );
      expect( upsertMemoMock.mock.invocationCallOrder[0] ).toBeLessThan( workflowStartMock.mock.invocationCallOrder[0] );
    } );

    it.each( [
      {
        name: 'tracing is disabled',
        info: workflowInfo,
        options: { disableTrace: true }
      },
      {
        name: 'the workflow has a root',
        info: { ...workflowInfo, root: { workflowId: 'root-workflow', runId: 'root-run' } },
        options: { disableTrace: false }
      }
    ] )( 'does not build trace info when $name', async ( { info, options } ) => {
      workflowInfoMock.mockReturnValue( info );
      workflowOptionsDefault.MyWorkflow = options;
      const { interceptors } = await import( './workflow.js' );
      const { inbound } = interceptors();

      await inbound[0].execute( { args: [ {} ] }, vi.fn().mockResolvedValue( undefined ) );

      expect( traceInfoBuildMock ).not.toHaveBeenCalled();
      expect( upsertMemoMock ).toHaveBeenCalledOnce();
      expect( upsertMemoMock ).toHaveBeenCalledWith( { payloadVersion: '2' } );
    } );

    it( 'calls sinks.workflow.start, next, then sinks.workflow.end on success', async () => {
      const { interceptors } = await import( './workflow.js' );
      const { inbound } = interceptors();
      const interceptor = inbound[0];
      const input = { args: [ { input: 'data' } ] };
      const next = vi.fn().mockResolvedValue( { output: 'ok' } );

      const result = await interceptor.execute( input, next );

      expect( workflowStartMock ).toHaveBeenCalledWith( { input: 'data' } );
      expect( next ).toHaveBeenCalledWith( input );
      expect( workflowEndMock ).toHaveBeenCalledWith( { output: 'ok' } );
      expect( result ).toEqual( { output: 'ok' } );
      expect( workflowErrorMock ).not.toHaveBeenCalled();
    } );

    it( 'rethrows native errors as Workflow Task failures without a terminal sink event', async () => {
      const { interceptors } = await import( './workflow.js' );
      const { inbound } = interceptors();
      const interceptor = inbound[0];
      const input = { args: [ {} ] };
      const err = new Error( 'workflow failed' );
      const next = vi.fn().mockRejectedValue( err );

      await expect( interceptor.execute( input, next ) ).rejects.toBe( err );
      expect( workflowStartMock ).toHaveBeenCalled();
      expect( workflowErrorMock ).not.toHaveBeenCalled();
      expect( workflowEndMock ).not.toHaveBeenCalled();
    } );

    it.each( [
      { ErrorType: FatalError, type: 'FatalError' },
      { ErrorType: ValidationError, type: 'ValidationError' }
    ] )( 'converts $type into a non-retryable ApplicationFailure with serialized details', async ( { ErrorType, type } ) => {
      const { interceptors } = await import( './workflow.js' );
      const { inbound } = interceptors();
      const interceptor = inbound[0];
      const err = new ErrorType( 'workflow failed' );
      err.code = 'EWORKFLOW';
      const next = vi.fn().mockRejectedValue( err );

      const thrown = await interceptor.execute( { args: [ {} ] }, next ).catch( e => e );

      expect( thrown ).toBeInstanceOf( ApplicationFailure );
      expect( thrown ).toMatchObject( {
        message: 'workflow failed',
        type,
        nonRetryable: true,
        details: [ {
          error: {
            name: type,
            message: 'workflow failed',
            code: 'EWORKFLOW'
          }
        } ],
        cause: err
      } );
      expect( workflowErrorMock ).toHaveBeenCalledWith( expect.objectContaining( {
        name: type,
        message: 'workflow failed',
        code: 'EWORKFLOW',
        stack: expect.any( String )
      } ) );
      expect( workflowErrorMock.mock.calls[0][0] ).not.toBeInstanceOf( Error );
      expect( workflowEndMock ).not.toHaveBeenCalled();
    } );

    it( 'uses a transparent error cause for the sink and ApplicationFailure', async () => {
      const { interceptors } = await import( './workflow.js' );
      const { inbound } = interceptors();
      const interceptor = inbound[0];
      const cause = new TypeError( 'provider rejected request' );
      cause.code = 'EAUTH';
      const error = new TransparentFatalError( cause );
      const next = vi.fn().mockRejectedValue( error );

      const thrown = await interceptor.execute( { args: [ {} ] }, next ).catch( e => e );

      expect( thrown ).toMatchObject( {
        message: 'provider rejected request',
        type: 'TypeError',
        nonRetryable: true,
        cause,
        details: [ {
          error: {
            name: 'TypeError',
            message: 'provider rejected request',
            code: 'EAUTH'
          }
        } ]
      } );
      expect( workflowErrorMock ).toHaveBeenCalledWith( expect.objectContaining( {
        name: 'TypeError',
        message: 'provider rejected request',
        code: 'EAUTH',
        stack: expect.any( String )
      } ) );
      expect( workflowErrorMock.mock.calls[0][0] ).not.toHaveProperty( 'cause' );
      expect( workflowEndMock ).not.toHaveBeenCalled();
    } );

    it( 'sinks and rethrows existing Temporal failures unchanged', async () => {
      const { interceptors } = await import( './workflow.js' );
      const { inbound } = interceptors();
      const interceptor = inbound[0];
      const err = ApplicationFailure.retryable( 'domain failed', 'DomainFailure', { reason: 'invalid' } );
      const next = vi.fn().mockRejectedValue( err );

      await expect( interceptor.execute( { args: [ {} ] }, next ) ).rejects.toBe( err );
      expect( workflowErrorMock ).toHaveBeenCalledWith( expect.objectContaining( {
        name: 'ApplicationFailure',
        message: 'domain failed',
        type: 'DomainFailure',
        details: [ { reason: 'invalid' } ],
        stack: expect.any( String )
      } ) );
      expect( workflowErrorMock.mock.calls[0][0] ).not.toBeInstanceOf( Error );
      expect( workflowEndMock ).not.toHaveBeenCalled();
    } );

    it( 'calls sinks.workflow.error and rethrows cancellation errors without wrapping', async () => {
      const { interceptors } = await import( './workflow.js' );
      const { inbound } = interceptors();
      const interceptor = inbound[0];
      const cancellation = new Error( 'Workflow cancelled' );
      const next = vi.fn().mockRejectedValue( cancellation );
      isCancellationMock.mockReturnValue( true );

      await expect( interceptor.execute( { args: [ {} ] }, next ) ).rejects.toBe( cancellation );
      expect( isCancellationMock ).toHaveBeenCalledWith( cancellation );
      expect( workflowErrorMock ).toHaveBeenCalledWith( {
        name: 'Error',
        message: 'Workflow cancelled'
      } );
      expect( workflowErrorMock.mock.calls[0][0] ).not.toBeInstanceOf( Error );
      expect( workflowEndMock ).not.toHaveBeenCalled();
    } );

    it( 'ends the workflow trace and rethrows ContinueAsNew', async () => {
      const { ContinueAsNew } = await import( '@temporalio/workflow' );
      const { WorkflowSpecialOutput } = await import( '#consts' );
      const { interceptors } = await import( './workflow.js' );
      const { inbound } = interceptors();
      const interceptor = inbound[0];
      const continueErr = new ContinueAsNew();
      const next = vi.fn().mockRejectedValue( continueErr );

      await expect( interceptor.execute( { args: [ {} ] }, next ) ).rejects.toThrow( ContinueAsNew );
      expect( workflowEndMock ).toHaveBeenCalledWith( WorkflowSpecialOutput.CONTINUED_AS_NEW );
      expect( workflowErrorMock ).not.toHaveBeenCalled();
    } );
  } );
} );
