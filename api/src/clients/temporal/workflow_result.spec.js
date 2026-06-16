import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExtractErrorDetail, mockExtractErrorMessage, mockExtractFailure } = vi.hoisted( () => ( {
  mockExtractErrorDetail: vi.fn(),
  mockExtractErrorMessage: vi.fn(),
  mockExtractFailure: vi.fn()
} ) );

vi.mock( '#utils', () => ( {
  extractErrorDetail: mockExtractErrorDetail,
  extractErrorMessage: mockExtractErrorMessage,
  extractFailure: mockExtractFailure
} ) );

describe( 'buildWorkflowResult', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    mockExtractErrorDetail.mockImplementation( ( error, key ) => error.details?.[key] ?? null );
    mockExtractErrorMessage.mockImplementation( error => error.message );
    mockExtractFailure.mockImplementation( error => ( { message: error.message, name: error.name } ) );
  } );

  it( 'builds a successful result with output, trace, and aggregations', async () => {
    const { buildWorkflowResult } = await import( './workflow_result.js' );
    const resultPayload = {
      output: { ok: true },
      trace: { local: '/tmp/trace.json' },
      aggregations: { tokens: { total: 10 } }
    };

    const result = buildWorkflowResult( {
      workflowId: 'workflow-id',
      status: 'completed',
      runId: 'run-id',
      input: { input: true },
      result: resultPayload
    } );

    expect( result ).toEqual( {
      workflowId: 'workflow-id',
      runId: 'run-id',
      status: 'completed',
      input: { input: true },
      output: { ok: true },
      trace: { local: '/tmp/trace.json' },
      aggregations: { tokens: { total: 10 } },
      error: null,
      errorDetails: null
    } );
    expect( mockExtractErrorDetail ).not.toHaveBeenCalled();
    expect( mockExtractErrorMessage ).not.toHaveBeenCalled();
    expect( mockExtractFailure ).not.toHaveBeenCalled();
  } );

  it( 'uses null output fields when no workflow result is provided', async () => {
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
      aggregations: null,
      error: null,
      errorDetails: null
    } );
  } );

  it( 'overlays error trace, aggregations, message, and failure details when an error is provided', async () => {
    const { buildWorkflowResult } = await import( './workflow_result.js' );
    const error = Object.assign( new Error( 'step failed' ), {
      name: 'WorkflowFailedError',
      details: {
        trace: { local: '/tmp/error-trace.json' },
        aggregations: { cost: { total: 1.25 } }
      }
    } );

    const result = buildWorkflowResult( {
      workflowId: 'workflow-id',
      status: 'failed',
      runId: 'run-id',
      input: { input: true },
      error
    } );

    expect( mockExtractErrorDetail ).toHaveBeenCalledWith( error, 'trace' );
    expect( mockExtractErrorDetail ).toHaveBeenCalledWith( error, 'aggregations' );
    expect( mockExtractErrorMessage ).toHaveBeenCalledWith( error );
    expect( mockExtractFailure ).toHaveBeenCalledWith( error );
    expect( result ).toEqual( {
      workflowId: 'workflow-id',
      runId: 'run-id',
      status: 'failed',
      input: { input: true },
      output: null,
      trace: { local: '/tmp/error-trace.json' },
      aggregations: { cost: { total: 1.25 } },
      error: 'step failed',
      errorDetails: { message: 'step failed', name: 'WorkflowFailedError' }
    } );
  } );

  it( 'lets error metadata override result metadata when both are present', async () => {
    const { buildWorkflowResult } = await import( './workflow_result.js' );
    const error = Object.assign( new Error( 'failed after partial result' ), {
      details: {
        trace: { errorTrace: true },
        aggregations: { errorAggregations: true }
      }
    } );

    const result = buildWorkflowResult( {
      workflowId: 'workflow-id',
      status: 'failed',
      runId: 'run-id',
      input: null,
      result: {
        output: { partial: true },
        trace: { resultTrace: true },
        aggregations: { resultAggregations: true }
      },
      error
    } );

    expect( result ).toMatchObject( {
      output: { partial: true },
      trace: { errorTrace: true },
      aggregations: { errorAggregations: true },
      error: 'failed after partial result'
    } );
  } );
} );
