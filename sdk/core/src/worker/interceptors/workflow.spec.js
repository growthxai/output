import { describe, it, expect, vi, beforeEach } from 'vitest';

const METADATA_ACCESS_SYMBOL = vi.hoisted( () => Symbol( '__metadata' ) );

const workflowInfoMock = vi.fn();
const workflowStartMock = vi.fn();
const workflowEndMock = vi.fn();
const workflowErrorMock = vi.fn();
vi.mock( '@temporalio/workflow', () => ( {
  workflowInfo: ( ...args ) => workflowInfoMock( ...args ),
  proxySinks: () => ( {
    workflow: { start: workflowStartMock, end: workflowEndMock, error: workflowErrorMock }
  } ),
  ApplicationFailure: class ApplicationFailure {
    constructor( message, type, nonRetryable, cause, originalError ) {
      this.message = message;
      this.type = type;
      this.nonRetryable = nonRetryable;
      this.cause = cause;
      this.originalError = originalError;
      this.details = undefined;
    }
  },
  ContinueAsNew: class ContinueAsNew extends Error {
    constructor() {
      super( 'ContinueAsNew' );
      this.name = 'ContinueAsNew';
    }
  }
} ) );

const memoToHeadersMock = vi.fn( memo => ( memo ? { ...memo, __asHeaders: true } : {} ) );
vi.mock( '../sandboxed_utils.js', () => ( { memoToHeaders: ( ...args ) => memoToHeadersMock( ...args ) } ) );

const deepMergeMock = vi.fn( ( a, b ) => ( { ...( a || {} ), ...( b || {} ) } ) );
vi.mock( '#utils', () => ( { deepMerge: ( ...args ) => deepMergeMock( ...args ) } ) );

vi.mock( '#consts', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual, get METADATA_ACCESS_SYMBOL() {
      return METADATA_ACCESS_SYMBOL;
    }
  };
} );

const stepOptionsDefault = {};
vi.mock( '../temp/__activity_options.js', () => ( { default: stepOptionsDefault } ) );

describe( 'workflow interceptors', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    workflowInfoMock.mockReturnValue( { workflowType: 'MyWorkflow', memo: { executionContext: { id: 'ctx-1' } } } );
  } );

  describe( 'HeadersInjectionInterceptor', () => {
    it( 'assigns memo as headers via memoToHeaders and calls next', async () => {
      const { interceptors } = await import( './workflow.js' );
      const { outbound } = interceptors();
      const interceptor = outbound[0];
      const input = { headers: { existing: 'header' }, activityType: 'MyWorkflow#step1' };
      const next = vi.fn().mockResolvedValue( 'result' );

      memoToHeadersMock.mockReturnValue( { executionContext: { id: 'ctx-1' } } );

      const out = await interceptor.scheduleActivity( input, next );

      expect( memoToHeadersMock ).toHaveBeenCalledWith( { executionContext: { id: 'ctx-1' } } );
      expect( input.headers ).toEqual( { existing: 'header', executionContext: { id: 'ctx-1' } } );
      expect( next ).toHaveBeenCalledWith( input );
      expect( out ).toBe( 'result' );
    } );

    it( 'merges stepOptions with memo.activityOptions when stepOptions exist for activityType', async () => {
      stepOptionsDefault['MyWorkflow#step1'] = { scheduleToCloseTimeout: 60 };
      workflowInfoMock.mockReturnValue( {
        workflowType: 'MyWorkflow',
        memo: { executionContext: {}, activityOptions: { heartbeatTimeout: 10 } }
      } );
      memoToHeadersMock.mockReturnValue( {} );
      deepMergeMock.mockReturnValue( { heartbeatTimeout: 10, scheduleToCloseTimeout: 60 } );

      const { interceptors } = await import( './workflow.js' );
      const { outbound } = interceptors();
      const interceptor = outbound[0];
      const input = { headers: {}, activityType: 'MyWorkflow#step1' };
      const next = vi.fn().mockResolvedValue( undefined );

      await interceptor.scheduleActivity( input, next );

      expect( deepMergeMock ).toHaveBeenCalledWith( { heartbeatTimeout: 10 }, { scheduleToCloseTimeout: 60 } );
      expect( input.options ).toEqual( { heartbeatTimeout: 10, scheduleToCloseTimeout: 60 } );
      delete stepOptionsDefault['MyWorkflow#step1'];
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

    it( 'calls sinks.workflow.error and throws ApplicationFailure on error', async () => {
      const { interceptors } = await import( './workflow.js' );
      const { inbound } = interceptors();
      const interceptor = inbound[0];
      const input = { args: [ {} ] };
      const err = new Error( 'workflow failed' );
      const next = vi.fn().mockRejectedValue( err );

      await expect( interceptor.execute( input, next ) ).rejects.toMatchObject( {
        message: 'workflow failed',
        type: 'Error',
        originalError: err
      } );
      expect( workflowStartMock ).toHaveBeenCalled();
      expect( workflowErrorMock ).toHaveBeenCalledWith( err );
      expect( workflowEndMock ).not.toHaveBeenCalled();
    } );

    it( 'sets failure.details from error metadata when present', async () => {
      const { interceptors } = await import( './workflow.js' );
      const { ApplicationFailure } = await import( '@temporalio/workflow' );
      const { inbound } = interceptors();
      const interceptor = inbound[0];
      const meta = { code: 'CUSTOM' };
      const err = new Error( 'custom' );
      err[METADATA_ACCESS_SYMBOL] = meta;
      const next = vi.fn().mockRejectedValue( err );

      const error = await ( async () => {
        try {
          await interceptor.execute( { args: [ {} ] }, next );
          return null;
        } catch ( error ) {
          return error;
        }
      } )();
      expect( error ).toBeInstanceOf( ApplicationFailure );
      expect( error.details ).toEqual( [ meta ] );
    } );

    it( 'on ContinueAsNew calls sinks.trace.addWorkflowEventEnd and rethrows', async () => {
      const { ContinueAsNew } = await import( '@temporalio/workflow' );
      const { interceptors } = await import( './workflow.js' );
      const { inbound } = interceptors();
      const interceptor = inbound[0];
      const continueErr = new ContinueAsNew();
      const next = vi.fn().mockRejectedValue( continueErr );

      await expect( interceptor.execute( { args: [ {} ] }, next ) ).rejects.toThrow( ContinueAsNew );
      expect( workflowEndMock ).toHaveBeenCalledWith( '<continued_as_new>' );
      expect( workflowErrorMock ).not.toHaveBeenCalled();
    } );
  } );
} );
