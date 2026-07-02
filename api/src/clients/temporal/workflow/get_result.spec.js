import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowNotCompletedError } from '../../errors.js';
import { WorkflowStatus } from '../types.js';

const {
  mockFromPayload,
  mockFormatStatus,
  mockBuildWorkflowResult,
  mockLoggerWarn,
  mockFetchHistoryPage,
  MockWorkflowFailedError
} = vi.hoisted( () => {
  class MockWorkflowFailedError extends Error {}

  return {
    mockFromPayload: vi.fn(),
    mockFormatStatus: vi.fn(),
    mockBuildWorkflowResult: vi.fn(),
    mockLoggerWarn: vi.fn(),
    mockFetchHistoryPage: vi.fn(),
    MockWorkflowFailedError
  };
} );

vi.mock( '@temporalio/client', () => ( {
  defaultPayloadConverter: { fromPayload: mockFromPayload },
  WorkflowFailedError: MockWorkflowFailedError
} ) );

vi.mock( '#logger', () => ( {
  logger: { warn: mockLoggerWarn }
} ) );

vi.mock( '../workflow_result.js', () => ( {
  buildWorkflowResult: mockBuildWorkflowResult
} ) );

vi.mock( '../types.js', async importOriginal => ( {
  ...( await importOriginal() ),
  formatStatus: mockFormatStatus
} ) );

vi.mock( './fetch_history_page.js', () => ( {
  fetchHistoryPage: mockFetchHistoryPage
} ) );

describe( 'extractWorkflowInput', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    mockFromPayload.mockImplementation( payload => ( { decoded: payload } ) );
  } );

  it( 'returns null when no first input payload exists', async () => {
    const { extractWorkflowInput } = await import( './get_result.js' );

    expect( extractWorkflowInput( null ) ).toBeNull();
    expect( extractWorkflowInput( { events: [] } ) ).toBeNull();
    expect( extractWorkflowInput( { events: [ { workflowExecutionStartedEventAttributes: { input: { payloads: [] } } } ] } ) ).toBeNull();
  } );

  it( 'decodes the first workflow input payload', async () => {
    const payload = { data: 'payload' };
    const { extractWorkflowInput } = await import( './get_result.js' );

    expect( extractWorkflowInput( {
      events: [ { workflowExecutionStartedEventAttributes: { input: { payloads: [ payload ] } } } ]
    } ) ).toEqual( { decoded: payload } );
    expect( mockFromPayload ).toHaveBeenCalledWith( payload );
  } );
} );

describe( 'getResult', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    mockFromPayload.mockImplementation( payload => ( { decoded: payload } ) );
    mockFormatStatus.mockReturnValue( 'formatted-status' );
    mockBuildWorkflowResult.mockImplementation( args => ( { shaped: args } ) );
  } );

  const makeGetResult = ( { describe, result, historyResponse, historyError } = {} ) => {
    const latestHandle = {
      describe: vi.fn().mockResolvedValue( describe ?? {
        runId: 'resolved-run',
        status: { code: WorkflowStatus.COMPLETED, name: 'COMPLETED' }
      } ),
      result: vi.fn()
    };
    const pinnedHandle = {
      result: vi.fn( result ?? vi.fn().mockResolvedValue( { output: { ok: true } } ) )
    };
    const getHandle = vi.fn()
      .mockReturnValueOnce( latestHandle )
      .mockReturnValue( pinnedHandle );

    if ( historyError !== undefined ) {
      mockFetchHistoryPage.mockRejectedValue( historyError );
    } else {
      mockFetchHistoryPage.mockResolvedValue( historyResponse ?? {
        history: {
          events: [ {
            workflowExecutionStartedEventAttributes: { input: { payloads: [ { input: true } ] } }
          } ]
        }
      } );
    }

    return {
      latestHandle,
      pinnedHandle,
      getHandle,
      client: { workflow: { getHandle } },
      connection: { workflowService: {} }
    };
  };

  it( 'throws WorkflowNotCompletedError when the workflow is still running', async () => {
    const fixtures = makeGetResult( {
      describe: { runId: 'run-id', status: { code: WorkflowStatus.RUNNING, name: 'RUNNING' } }
    } );
    const { getResult } = await import( './get_result.js' );

    await expect( getResult( fixtures, 'workflow-id' ) ).rejects.toBeInstanceOf( WorkflowNotCompletedError );
    expect( mockFetchHistoryPage ).not.toHaveBeenCalled();
  } );

  it( 'throws before history fetch when a terminal describe has no runId', async () => {
    const fixtures = makeGetResult( {
      describe: { status: { code: WorkflowStatus.COMPLETED, name: 'COMPLETED' } }
    } );
    const { getResult } = await import( './get_result.js' );

    await expect( getResult( fixtures, 'workflow-id' ) ).rejects.toThrow( /did not report a runId/ );
    expect( mockFetchHistoryPage ).not.toHaveBeenCalled();
  } );

  it( 'pins latest-run result reads to the described runId and returns completed output', async () => {
    const workflowOutput = { output: { ok: true }, trace: null };
    const fixtures = makeGetResult( { result: vi.fn().mockResolvedValue( workflowOutput ) } );
    const { getResult } = await import( './get_result.js' );

    const result = await getResult( fixtures, 'workflow-id' );

    expect( fixtures.getHandle ).toHaveBeenNthCalledWith( 1, 'workflow-id', undefined );
    expect( fixtures.getHandle ).toHaveBeenNthCalledWith( 2, 'workflow-id', 'resolved-run' );
    expect( mockFetchHistoryPage ).toHaveBeenCalledWith( fixtures.connection, 'workflow-id', 'resolved-run', { maximumPageSize: 1 } );
    expect( mockFormatStatus ).toHaveBeenCalledWith( 'COMPLETED' );
    expect( mockBuildWorkflowResult ).toHaveBeenCalledWith( {
      workflowId: 'workflow-id',
      status: 'formatted-status',
      runId: 'resolved-run',
      input: { decoded: { input: true } },
      result: workflowOutput
    } );
    expect( result ).toEqual( { shaped: mockBuildWorkflowResult.mock.calls[0][0] } );
  } );

  it( 'does not re-pin when caller provides a runId', async () => {
    const explicitHandle = {
      describe: vi.fn().mockResolvedValue( {
        runId: 'explicit-run',
        status: { code: WorkflowStatus.COMPLETED, name: 'COMPLETED' }
      } ),
      result: vi.fn().mockResolvedValue( { output: null } )
    };
    const getHandle = vi.fn().mockReturnValue( explicitHandle );
    mockFetchHistoryPage.mockResolvedValue( { history: { events: [] } } );
    const { getResult } = await import( './get_result.js' );
    const internals = {
      client: { workflow: { getHandle } },
      connection: { workflowService: {} }
    };

    await getResult( internals, 'workflow-id', 'explicit-run' );

    expect( getHandle ).toHaveBeenCalledTimes( 1 );
    expect( getHandle ).toHaveBeenCalledWith( 'workflow-id', 'explicit-run' );
    expect( explicitHandle.result ).toHaveBeenCalled();
  } );

  it( 'returns a result without calling handle.result for CONTINUED_AS_NEW', async () => {
    const fixtures = makeGetResult( {
      describe: {
        runId: 'continued-run',
        status: { code: WorkflowStatus.CONTINUED_AS_NEW, name: 'CONTINUED_AS_NEW' }
      }
    } );
    const { getResult } = await import( './get_result.js' );

    await getResult( fixtures, 'workflow-id' );

    expect( fixtures.pinnedHandle.result ).not.toHaveBeenCalled();
    expect( mockBuildWorkflowResult ).toHaveBeenCalledWith( {
      workflowId: 'workflow-id',
      status: 'formatted-status',
      runId: 'continued-run',
      input: { decoded: { input: true } }
    } );
  } );

  it( 'captures WorkflowFailedError for failed terminal statuses', async () => {
    const workflowError = new MockWorkflowFailedError( 'workflow failed' );
    const fixtures = makeGetResult( {
      describe: {
        runId: 'failed-run',
        status: { code: WorkflowStatus.FAILED, name: 'FAILED' }
      },
      result: vi.fn().mockRejectedValue( workflowError )
    } );
    const { getResult } = await import( './get_result.js' );

    await getResult( fixtures, 'workflow-id' );

    expect( mockBuildWorkflowResult ).toHaveBeenCalledWith( {
      workflowId: 'workflow-id',
      status: 'formatted-status',
      runId: 'failed-run',
      input: { decoded: { input: true } },
      error: workflowError
    } );
  } );

  it( 'logs and rethrows unexpected result-read errors', async () => {
    const unexpectedError = new Error( 'connection lost' );
    const fixtures = makeGetResult( {
      describe: {
        runId: 'failed-run',
        status: { code: WorkflowStatus.FAILED, name: 'FAILED' }
      },
      result: vi.fn().mockRejectedValue( unexpectedError )
    } );
    const { getResult } = await import( './get_result.js' );

    await expect( getResult( fixtures, 'workflow-id' ) ).rejects.toBe( unexpectedError );
    expect( mockLoggerWarn ).toHaveBeenCalledWith( 'Unexpected error fetching workflow result', {
      workflowId: 'workflow-id',
      status: 'formatted-status',
      errorType: 'Error',
      message: 'connection lost'
    } );
  } );

  it( 'propagates errors from fetchHistoryPage unchanged', async () => {
    const unavailable = new Error( 'unavailable' );
    const fixtures = makeGetResult( { historyError: unavailable } );
    const { getResult } = await import( './get_result.js' );

    await expect( getResult( fixtures, 'workflow-id' ) ).rejects.toBe( unavailable );
  } );

  it( 'returns null input when the history response has no history field', async () => {
    const fixtures = makeGetResult( { historyResponse: {} } );
    const { getResult } = await import( './get_result.js' );

    await getResult( fixtures, 'workflow-id' );

    expect( mockBuildWorkflowResult ).toHaveBeenCalledWith( expect.objectContaining( { input: null } ) );
  } );
} );
