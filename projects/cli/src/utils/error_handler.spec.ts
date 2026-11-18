/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CLIError, ExitError } from '@oclif/core/errors';
import { ux } from '@oclif/core/ux';
import { createErrorFn, handleApiError, handleCommandError } from './error_handler.js';

const errorFn = () => vi.fn( ( message: string ) => {
  throw new Error( message );
} ) as any;

const apiError = ( status: number, data?: unknown ) =>
  Object.assign( new Error( 'request failed' ), { response: { status, data } } );

describe( 'handleApiError()', () => {
  it( 'prefers a caller override over the server body for the same status', () => {
    const fn = errorFn();

    expect( () => handleApiError(
      apiError( 404, { error: 'WorkflowNotFoundError', message: 'Workflow "wf-1" not found' } ),
      fn,
      { 404: 'Workflow not found. Check the workflow ID.' }
    ) ).toThrow( 'Workflow not found. Check the workflow ID.' );
  } );

  it( 'surfaces the server body when no override covers the status', () => {
    const fn = errorFn();

    // What `start --monitor` relies on now that it passes no 404 override: the
    // API's own words, rather than advice about an id the user never typed.
    expect( () => handleApiError(
      apiError( 404, { error: 'WorkflowNotFoundError', message: 'Workflow "wf-1" not found' } ),
      fn
    ) ).toThrow( 'WorkflowNotFoundError: Workflow "wf-1" not found.' );
  } );

  it( 'appends a root cause to the server message when the API reports one', () => {
    const fn = errorFn();

    expect( () => handleApiError(
      apiError( 500, { error: 'StepFailure', message: 'Step failed', rootCause: { error: 'TypeError', message: 'x is not a function' } } ),
      fn
    ) ).toThrow( /TypeError: x is not a function/ );
  } );

  it( 'falls back to the status default when the body carries no detail', () => {
    const fn = errorFn();

    expect( () => handleApiError( apiError( 401 ), fn ) ).toThrow( /OUTPUT_API_AUTH_TOKEN/ );
  } );

  it.each( [
    [ 'a top-level code', Object.assign( new Error( 'connect' ), { code: 'ECONNREFUSED' } ) ],
    [ 'a nested cause', Object.assign( new Error( 'fetch failed' ), { cause: { code: 'ECONNREFUSED' } } ) ]
  ] )( 'reports a refused connection from %s before looking at any status', ( _label, error ) => {
    const fn = errorFn();

    expect( () => handleApiError( error, fn ) ).toThrow( /Is the API server running\?/ );
  } );

  it( 'assembles a detailed message when there is no response at all', () => {
    const fn = errorFn();
    const error = Object.assign( new Error( 'fetch failed' ), {
      cause: Object.assign( new Error( 'getaddrinfo EAI_AGAIN api' ), { code: 'EAI_AGAIN', hostname: 'api', port: 3001 } )
    } );

    expect( () => handleApiError( error, fn ) ).toThrow( /fetch failed \| Cause: getaddrinfo EAI_AGAIN api \| Code: EAI_AGAIN \| Host: api:3001/ );
  } );

  it( 'always exits 1, leaving a command\'s own exit codes to the command', () => {
    const fn = errorFn();

    expect( () => handleApiError( apiError( 500 ), fn ) ).toThrow();
    expect( fn ).toHaveBeenCalledWith( expect.any( String ), { exit: 1, status: 500, code: undefined } );
  } );

  it( 'passes the HTTP status and the error code along for structured output', () => {
    const fn = errorFn();
    const error = Object.assign( new Error( 'fetch failed' ), { cause: { code: 'ECONNREFUSED' } } );

    expect( () => handleApiError( error, fn ) ).toThrow();
    expect( fn ).toHaveBeenCalledWith( expect.any( String ), { exit: 1, status: undefined, code: 'ECONNREFUSED' } );
  } );
} );

describe( 'handleCommandError()', () => {
  it( 'hands an oclif error to errorFn with its own exit code and the original error', () => {
    const fn = errorFn();
    // `workflow start --monitor` raises exit 2 (bad flag combination) and exit 3
    // (started but unmonitorable); flattening those to exit 1 would let a CI job
    // retrying on a failed workflow re-submit one that is already running.
    const cliError = new CLIError( 'Cannot combine --monitor with --json', { exit: 2 } );

    expect( () => handleCommandError( cliError, fn ) ).toThrow();
    expect( fn ).toHaveBeenCalledWith( 'Cannot combine --monitor with --json', { exit: 2, original: cliError } );
  } );

  it( 'maps anything that came back from the API the same way handleApiError does', () => {
    const fn = errorFn();

    expect( () => handleCommandError(
      apiError( 404 ),
      fn,
      { 404: 'Workflow not found. Check the workflow name.' }
    ) ).toThrow( 'Workflow not found. Check the workflow name.' );
  } );
} );

describe( 'createErrorFn()', () => {
  afterEach( () => {
    vi.restoreAllMocks();
  } );

  const command = ( isJson: boolean ) => ( {
    jsonEnabled: () => isJson,
    error: vi.fn( ( message: string ) => {
      throw new Error( message );
    } )
  } ) as any;

  const printedJson = ( stderr: ReturnType<typeof vi.spyOn> ) => JSON.parse( String( stderr.mock.calls[0][0] ) );

  it( 'fails through command.error() with the exit code in text mode', () => {
    const cmd = command( false );

    expect( () => createErrorFn( cmd )( 'Workflow not found.', { exit: 1, status: 404 } ) ).toThrow( 'Workflow not found.' );
    expect( cmd.error ).toHaveBeenCalledWith( 'Workflow not found.', { exit: 1 } );
  } );

  it( 'rethrows the original oclif error in text mode', () => {
    const cmd = command( false );
    const original = new CLIError( 'bad flags', { exit: 2 } );

    expect( () => createErrorFn( cmd )( original.message, { exit: 2, original } ) ).toThrow( original );
    expect( cmd.error ).not.toHaveBeenCalled();
  } );

  it( 'writes the error as JSON to stderr, leaves stdout alone and exits without printing in json mode', () => {
    const stderr = vi.spyOn( ux, 'stderr' ).mockImplementation( () => {} );
    const stdout = vi.spyOn( ux, 'stdout' ).mockImplementation( () => {} );
    const cmd = command( true );

    const fail = createErrorFn( cmd );

    expect( () => fail( 'Workflow not found.', { exit: 1, status: 404, code: undefined } ) ).toThrow( ExitError );
    expect( printedJson( stderr ) ).toEqual( { error: { message: 'Workflow not found.', status: 404 } } );
    expect( stdout ).not.toHaveBeenCalled();
    expect( cmd.error ).not.toHaveBeenCalled();
  } );

  it( 'keeps the exit code of an oclif error in json mode and includes the error code', () => {
    const stderr = vi.spyOn( ux, 'stderr' ).mockImplementation( () => {} );
    const original = new CLIError( 'Cannot combine --monitor with --json', { exit: 2 } );

    expect( () => createErrorFn( command( true ) )( original.message, { exit: 2, code: 'ECONNREFUSED', original } ) ).toThrow(
      expect.objectContaining( { oclif: { exit: 2 } } )
    );
    expect( printedJson( stderr ) ).toEqual( { error: { message: 'Cannot combine --monitor with --json', code: 'ECONNREFUSED' } } );
  } );
} );
