import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExtractErrorMessage, mockExtractFailure } = vi.hoisted( () => ( {
  mockExtractErrorMessage: vi.fn(),
  mockExtractFailure: vi.fn()
} ) );

vi.mock( '#utils', async importOriginal => ( {
  ...( await importOriginal() ),
  extractErrorMessage: mockExtractErrorMessage,
  extractFailure: mockExtractFailure
} ) );

describe( 'buildWorkflowResult', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    mockExtractErrorMessage.mockImplementation( error => error.message );
    mockExtractFailure.mockImplementation( error => ( { message: error.message, name: error.name } ) );
  } );

  it( 'builds a V2 result with direct output and memo trace', async () => {
    const { buildWorkflowResult } = await import( './workflow_result.js' );
    const resultPayload = { ok: true };
    const trace = { local: '/tmp/trace.json' };
    const memo = { payloadVersion: '2', trace };

    const result = buildWorkflowResult( {
      workflowId: 'workflow-id',
      status: 'completed',
      runId: 'run-id',
      input: { input: true },
      result: resultPayload,
      memo
    } );

    expect( result ).toEqual( {
      v: '2',
      workflowId: 'workflow-id',
      runId: 'run-id',
      status: 'completed',
      input: { input: true },
      output: resultPayload,
      trace,
      error: null
    } );
    expect( mockExtractErrorMessage ).not.toHaveBeenCalled();
    expect( mockExtractFailure ).not.toHaveBeenCalled();
  } );

  it( 'keeps legacy wrapped results when the payload version memo is absent', async () => {
    const { buildWorkflowResult } = await import( './workflow_result.js' );
    const resultPayload = {
      __output_workflow_wrapper_version: 1,
      output: { ok: true },
      trace: { destinations: { local: '/tmp/trace.json' } }
    };

    expect( buildWorkflowResult( {
      workflowId: 'workflow-id',
      status: 'completed',
      runId: 'run-id',
      input: { input: true },
      result: resultPayload
    } ) ).toEqual( {
      workflowId: 'workflow-id',
      runId: 'run-id',
      status: 'completed',
      input: { input: true },
      output: { ok: true },
      trace: { destinations: { local: '/tmp/trace.json' } },
      error: null,
      errorDetails: null
    } );
  } );

  it( 'uses null V2 output when no workflow result is provided', async () => {
    const { buildWorkflowResult } = await import( './workflow_result.js' );

    expect( buildWorkflowResult( {
      workflowId: 'workflow-id',
      status: 'continued_as_new',
      runId: 'run-id',
      input: null,
      memo: { payloadVersion: '2' }
    } ) ).toEqual( {
      v: '2',
      workflowId: 'workflow-id',
      runId: 'run-id',
      status: 'continued_as_new',
      input: null,
      output: null,
      trace: null,
      error: null
    } );
  } );

  it( 'keeps the V1 shape when no payload version memo exists', async () => {
    const { buildWorkflowResult } = await import( './workflow_result.js' );

    expect( buildWorkflowResult( {
      workflowId: 'workflow-id',
      status: 'continued_as_new',
      runId: 'run-id',
      input: null
    } ) ).toEqual( {
      workflowId: 'workflow-id',
      runId: 'run-id',
      status: 'continued_as_new',
      input: null,
      output: null,
      trace: null,
      error: null,
      errorDetails: null
    } );
  } );

  it( 'keeps legacy error data from Temporal details', async () => {
    const { buildWorkflowResult } = await import( './workflow_result.js' );
    const trace = { local: '/tmp/error-trace.json' };
    const error = Object.assign( new Error( 'step failed' ), {
      name: 'WorkflowFailedError',
      details: [ { trace } ]
    } );

    const result = buildWorkflowResult( {
      workflowId: 'workflow-id',
      status: 'failed',
      runId: 'run-id',
      input: { input: true },
      error
    } );

    expect( mockExtractErrorMessage ).toHaveBeenCalledWith( error );
    expect( mockExtractFailure ).toHaveBeenCalledWith( error );
    expect( result ).toEqual( {
      workflowId: 'workflow-id',
      runId: 'run-id',
      status: 'failed',
      input: { input: true },
      output: null,
      trace,
      error: 'step failed',
      errorDetails: { message: 'step failed', name: 'WorkflowFailedError' }
    } );
  } );

  it( 'builds a V2 failure from serialized details in the cause chain', async () => {
    const { buildWorkflowResult } = await import( './workflow_result.js' );
    const serializedError = { name: 'ValidationError', message: 'invalid input', code: 'EINPUT' };
    const applicationFailure = Object.assign( new Error( 'invalid input' ), {
      details: [ { error: serializedError } ]
    } );
    const error = Object.assign( new Error( 'activity failed' ), {
      activityType: 'myWorkflow#validate',
      cause: applicationFailure
    } );
    const trace = { local: '/tmp/trace.json' };
    const memo = { payloadVersion: '2', trace };

    expect( buildWorkflowResult( {
      workflowId: 'workflow-id',
      status: 'failed',
      runId: 'run-id',
      input: null,
      memo,
      error
    } ) ).toEqual( {
      v: '2',
      workflowId: 'workflow-id',
      runId: 'run-id',
      status: 'failed',
      input: null,
      output: null,
      trace,
      error: {
        activityType: 'myWorkflow#validate',
        ...serializedError
      }
    } );
  } );

  it( 'prefers the deepest error type when no serialized details exist', async () => {
    const { serializeError } = await import( './workflow_result.js' );
    const cause = Object.assign( new Error( 'domain failure' ), {
      name: 'ApplicationFailure',
      type: 'DomainFailure'
    } );
    const error = new Error( 'workflow failed', { cause } );

    expect( serializeError( error ) ).toEqual( {
      activityType: undefined,
      name: 'DomainFailure',
      message: 'domain failure'
    } );
  } );

  it( 'uses the deepest error constructor name when no serialized details exist', async () => {
    const { serializeError } = await import( './workflow_result.js' );
    class CustomFailure extends Error {}
    const cause = new CustomFailure( 'deep failure' );
    const error = new Error( 'workflow failed', { cause } );

    expect( serializeError( error ) ).toEqual( {
      activityType: undefined,
      name: 'CustomFailure',
      message: 'deep failure'
    } );
  } );

  it( 'stops at the deepest Error when its cause is not an Error', async () => {
    const { serializeError } = await import( './workflow_result.js' );
    const error = new TypeError( 'typed failure', { cause: 'raw cause' } );

    expect( serializeError( error ) ).toEqual( {
      activityType: undefined,
      name: 'TypeError',
      message: 'typed failure'
    } );
  } );
} );
