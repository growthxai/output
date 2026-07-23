import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApplicationFailure } from '@temporalio/common';
import { FatalError, ValidationError } from '#errors';

const workflowInfoMock = vi.fn();
const workflowStartMock = vi.fn();
const workflowEndMock = vi.fn();
const workflowErrorMock = vi.fn();
const isCancellationMock = vi.fn();
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
    isCancellation: ( ...args ) => isCancellationMock( ...args )
  };
} );

const memoToHeadersMock = vi.fn( memo => ( memo ? { ...memo, __asHeaders: true } : {} ) );
vi.mock( './headers.js', () => ( { memoToHeaders: ( ...args ) => memoToHeadersMock( ...args ) } ) );

const deepMergeMock = vi.fn( ( a, b ) => ( { ...( a || {} ), ...( b || {} ) } ) );
vi.mock( '#helpers/object', () => ( { deepMerge: ( ...args ) => deepMergeMock( ...args ) } ) );

const activityOptionsDefault = {};
vi.mock( '../temp/__activity_options.js', () => ( { default: activityOptionsDefault } ) );

describe( 'workflow interceptors', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    Object.keys( activityOptionsDefault ).forEach( key => delete activityOptionsDefault[key] );
    isCancellationMock.mockReturnValue( false );
    workflowInfoMock.mockReturnValue( workflowInfo );
  } );

  describe( 'HeadersInjectionInterceptor', () => {
    it( 'assigns memo as headers via memoToHeaders and calls next', async () => {
      const { interceptors } = await import( './workflow.js' );
      const { outbound } = interceptors();
      const interceptor = outbound[0];
      const input = { headers: { existing: 'header' }, activityType: 'MyWorkflow#step1' };
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
      deepMergeMock.mockReturnValue( { heartbeatTimeout: 10, scheduleToCloseTimeout: 60 } );

      const { interceptors } = await import( './workflow.js' );
      const { outbound } = interceptors();
      const interceptor = outbound[0];
      const input = { headers: {}, activityType: 'MyWorkflow#step1', options: { heartbeatTimeout: 10 } };
      const next = vi.fn().mockResolvedValue( undefined );

      await interceptor.scheduleActivity( input, next );

      expect( deepMergeMock ).toHaveBeenCalledWith( { heartbeatTimeout: 10 }, { scheduleToCloseTimeout: 60 } );
      expect( input.options ).toEqual( { heartbeatTimeout: 10, scheduleToCloseTimeout: 60 } );
    } );
  } );

  describe( 'WorkflowExecutionInterceptor', () => {
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
