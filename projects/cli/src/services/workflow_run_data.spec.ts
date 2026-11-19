import { describe, expect, it, vi } from 'vitest';
import { WorkflowNotFoundError, type Client } from '@temporalio/client';
import { collectWorkflowRunData } from './workflow_run_data.js';

const encodeJson = ( value: unknown ) => ( {
  metadata: { encoding: Buffer.from( 'json/plain' ) },
  data: Buffer.from( JSON.stringify( value ) )
} );

const nullPayload = { metadata: { encoding: Buffer.from( 'binary/null' ) } };

const startedEvent = ( payloads?: unknown[], firstExecutionRunId?: string ) => ( {
  eventId: 1,
  workflowExecutionStartedEventAttributes: { ...( payloads ? { input: { payloads } } : {} ), firstExecutionRunId }
} );

interface ClientOptions {
  type?: string;
  status?: string;
  runId?: string;
  describe?: () => Promise<unknown>;
  events?: unknown[];
  /** Events per run id, for specs that read more than one run. A run not listed fails like a deleted run */
  eventsByRun?: Record<string, unknown[]>;
  result?: unknown;
}

const rejectWith = ( error: unknown ) => async () => {
  throw error;
};

const buildClient = ( clientOptions: ClientOptions = {} ) => {
  const {
    type = 'simple',
    status = 'COMPLETED',
    runId = 'run-1',
    describe,
    eventsByRun,
    events = [ startedEvent( [ encodeJson( { values: [ 1, 2, 3 ] } ) ] ) ]
  } = clientOptions;
  // An explicit undefined result must stay undefined, so a default cannot be used here
  const result = 'result' in clientOptions ? clientOptions.result : { total: 6 };
  const handle = {
    describe: vi.fn( describe ?? ( async () => ( { type, runId, status: { name: status } } ) ) ),
    result: vi.fn( async () => result )
  };
  const getHandle = vi.fn( () => handle );
  const getWorkflowExecutionHistory = vi.fn( async ( request: { execution: { runId: string } } ) => {
    if ( !eventsByRun ) {
      return { history: { events } };
    }
    const runEvents = eventsByRun[request.execution.runId];
    if ( !runEvents ) {
      throw new Error( `5 NOT_FOUND: workflow execution not found (${request.execution.runId})` );
    }
    return { history: { events: runEvents } };
  } );
  const withDeadline = vi.fn( async ( _deadline: number, fn: () => Promise<unknown> ) => fn() );
  const client = {
    options: { namespace: 'default' },
    workflow: { getHandle },
    connection: { withDeadline, workflowService: { getWorkflowExecutionHistory } }
  } as unknown as Client;

  return { client, handle, getHandle, getWorkflowExecutionHistory, withDeadline };
};

const options = { workflowName: 'simple', workflowId: 'wf-1' };

describe( 'collectWorkflowRunData', () => {
  it( 'returns the ids, the decoded start input and the result of a completed run', async () => {
    const { client } = buildClient();

    await expect( collectWorkflowRunData( client, options ) ).resolves.toEqual( {
      workflowId: 'wf-1',
      runId: 'run-1',
      inputRunId: 'run-1',
      input: { values: [ 1, 2, 3 ] },
      output: { total: 6 }
    } );
  } );

  it( 'describes the requested run, or the latest one when no run id is given', async () => {
    const { client, getHandle } = buildClient();

    await collectWorkflowRunData( client, { ...options, runId: 'run-9' } );
    await collectWorkflowRunData( client, options );

    // Each run reads: describe, then (pinned to the described run) the result
    expect( getHandle ).toHaveBeenNthCalledWith( 1, 'wf-1', 'run-9' );
    expect( getHandle ).toHaveBeenNthCalledWith( 3, 'wf-1', undefined );
  } );

  it( 'reads the input and the result of the run it described, even when no run id was given', async () => {
    const { client, getHandle, getWorkflowExecutionHistory } = buildClient( { runId: 'run-latest' } );

    const data = await collectWorkflowRunData( client, options );

    expect( data.runId ).toBe( 'run-latest' );
    expect( getWorkflowExecutionHistory ).toHaveBeenCalledWith( {
      namespace: 'default',
      execution: { workflowId: 'wf-1', runId: 'run-latest' },
      maximumPageSize: 1
    } );
    expect( getHandle ).toHaveBeenLastCalledWith( 'wf-1', 'run-latest' );
  } );

  it( 'runs every Temporal call under a deadline', async () => {
    const { client, withDeadline } = buildClient();

    await collectWorkflowRunData( client, options );

    expect( withDeadline ).toHaveBeenCalledTimes( 3 );
    expect( withDeadline.mock.calls[0][0] ).toBeGreaterThan( Date.now() );
  } );

  it( 'fails for a run of another workflow type and reads nothing else', async () => {
    const { client, getWorkflowExecutionHistory, handle } = buildClient( { type: 'other' } );

    await expect( collectWorkflowRunData( client, options ) ).rejects.toThrow(
      'Workflow wf-1 (run run-1) is a "other" workflow, not "simple". Use "other" as the workflow name; aliases are not accepted.'
    );
    expect( getWorkflowExecutionHistory ).not.toHaveBeenCalled();
    expect( handle.result ).not.toHaveBeenCalled();
  } );

  it.each( [
    [ 'RUNNING', 'running' ],
    [ 'FAILED', 'failed' ],
    [ 'CANCELLED', 'cancelled' ],
    [ 'TERMINATED', 'terminated' ],
    [ 'TIMED_OUT', 'timed out' ]
  ] )( 'fails for a %s run', async ( status, label ) => {
    const { client, getWorkflowExecutionHistory, handle } = buildClient( { status } );

    await expect( collectWorkflowRunData( client, options ) ).rejects.toThrow(
      `Workflow wf-1 (run run-1) is ${label}. Only completed runs can be turned into a dataset case.`
    );
    expect( getWorkflowExecutionHistory ).not.toHaveBeenCalled();
    expect( handle.result ).not.toHaveBeenCalled();
  } );

  it( 'tells the user which run to use for a run that continued as new', async () => {
    const { client } = buildClient( { status: 'CONTINUED_AS_NEW' } );

    await expect( collectWorkflowRunData( client, options ) ).rejects.toThrow(
      'Workflow wf-1 (run run-1) is continued as new. Only completed runs can be turned into a dataset case. ' +
      'Omit the run id or pass the run id of the last run.'
    );
  } );

  it( 'turns a missing workflow or run into a message that says what to check', async () => {
    const missing = new WorkflowNotFoundError( 'workflow not found for ID: wf-1', 'wf-1', undefined );
    const { client } = buildClient( { describe: rejectWith( missing ) } );

    const failure = await collectWorkflowRunData( client, options ).catch( ( error: Error ) => error );

    expect( failure ).toBeInstanceOf( Error );
    expect( ( failure as Error ).message ).toBe( 'Workflow not found for ID: wf-1. Check the workflow id, the run id and the namespace.' );
    expect( failure ).not.toBeInstanceOf( WorkflowNotFoundError );
  } );

  it( 'rethrows other describe failures untouched', async () => {
    const failure = new Error( 'Temporal did not answer within 30s' );
    const { client } = buildClient( { describe: rejectWith( failure ) } );

    await expect( collectWorkflowRunData( client, options ) ).rejects.toBe( failure );
  } );

  describe( 'a run that continued as new from earlier runs', () => {
    const chain = {
      'run-3': [ startedEvent( [ encodeJson( { value: 2 } ) ], 'run-1' ) ],
      'run-1': [ startedEvent( [ encodeJson( { value: 0 } ) ], 'run-1' ) ]
    };

    it( 'reads the input of the first run and the result of the described run', async () => {
      const { client, handle } = buildClient( { runId: 'run-3', eventsByRun: chain, result: { result: 3 } } );

      await expect( collectWorkflowRunData( client, options ) ).resolves.toEqual( {
        workflowId: 'wf-1',
        runId: 'run-3',
        inputRunId: 'run-1',
        input: { value: 0 },
        output: { result: 3 }
      } );
      expect( handle.result ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'does the same when the last run id is given', async () => {
      const { client } = buildClient( { runId: 'run-3', eventsByRun: chain } );

      await expect( collectWorkflowRunData( client, { ...options, runId: 'run-3' } ) ).resolves.toMatchObject( {
        runId: 'run-3', inputRunId: 'run-1', input: { value: 0 }
      } );
    } );

    it( 'fails when the first run can no longer be read, and does not fall back to the continuation input', async () => {
      const { client, handle } = buildClient( { runId: 'run-3', eventsByRun: { 'run-3': chain['run-3'] } } );

      await expect( collectWorkflowRunData( client, options ) ).rejects.toThrow(
        'Workflow wf-1 (run run-3) continued from run run-1, which could not be read, so its original input is unknown. ' +
        '5 NOT_FOUND: workflow execution not found (run-1)'
      );
      expect( handle.result ).not.toHaveBeenCalled();
    } );

    it( 'fails when the first run has no start event', async () => {
      const { client } = buildClient( { runId: 'run-3', eventsByRun: { 'run-3': chain['run-3'], 'run-1': [] } } );

      await expect( collectWorkflowRunData( client, options ) ).rejects.toThrow( 'Workflow wf-1 (run run-1) has no start event in its history.' );
    } );

    it( 'does not read another run for a run that is its own first run', async () => {
      const { client, getWorkflowExecutionHistory } = buildClient( { runId: 'run-1', eventsByRun: chain } );

      await collectWorkflowRunData( client, options );

      expect( getWorkflowExecutionHistory ).toHaveBeenCalledTimes( 1 );
    } );
  } );

  it( 'uses an empty input for a run that started without input', async () => {
    const { client } = buildClient( { events: [ startedEvent() ] } );

    await expect( collectWorkflowRunData( client, options ) ).resolves.toMatchObject( { input: {} } );
  } );

  it( 'fails when the history has no start event', async () => {
    const { client, handle } = buildClient( { events: [] } );

    await expect( collectWorkflowRunData( client, options ) ).rejects.toThrow( 'Workflow wf-1 (run run-1) has no start event in its history.' );
    expect( handle.result ).not.toHaveBeenCalled();
  } );

  it.each( [
    [ 'a string', 'hello' ],
    [ 'a number', 7 ],
    [ 'an array', [ 1, 2 ] ],
    [ 'null', null ]
  ] )( 'fails when the input is %s, not an object', async ( _label, value ) => {
    const { client, handle } = buildClient( { events: [ startedEvent( [ encodeJson( value ) ] ) ] } );

    await expect( collectWorkflowRunData( client, options ) ).rejects.toThrow(
      'Workflow wf-1 (run run-1) has an input that is not an object. A dataset case needs an object input.'
    );
    expect( handle.result ).not.toHaveBeenCalled();
  } );

  it( 'reads only the first input payload', async () => {
    const { client } = buildClient( { events: [ startedEvent( [ encodeJson( { first: true } ), encodeJson( { second: true } ) ] ) ] } );

    await expect( collectWorkflowRunData( client, options ) ).resolves.toMatchObject( { input: { first: true } } );
  } );

  it( 'keeps a result that is not an object', async () => {
    const { client } = buildClient( { result: 'done' } );

    await expect( collectWorkflowRunData( client, options ) ).resolves.toMatchObject( { output: 'done' } );
  } );

  it( 'returns a null output for a workflow that returned nothing', async () => {
    const { client } = buildClient( { result: undefined } );

    await expect( collectWorkflowRunData( client, options ) ).resolves.toMatchObject( { output: null } );
  } );

  it( 'keeps an explicit null result as null', async () => {
    const { client } = buildClient( { result: null } );

    await expect( collectWorkflowRunData( client, options ) ).resolves.toMatchObject( { output: null } );
  } );

  it( 'uses an empty input when the input payload encodes nothing', async () => {
    const { client } = buildClient( { events: [ startedEvent( [ nullPayload ] ) ] } );

    await expect( collectWorkflowRunData( client, options ) ).resolves.toMatchObject( { input: {} } );
  } );
} );
