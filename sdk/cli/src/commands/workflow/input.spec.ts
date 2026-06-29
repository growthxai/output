/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import { getWorkflowIdInput, getWorkflowIdRunsRidInput } from '#api/generated/api.js';
import WorkflowInput from './input.js';

vi.mock( 'node:fs/promises' );
vi.mock( '#api/generated/api.js', () => ( {
  getWorkflowIdInput: vi.fn(),
  getWorkflowIdRunsRidInput: vi.fn()
} ) );

const RID = '11111111-2222-4333-8444-555555555555';
const INPUT = { values: [ 1, 2, 3 ] };

const makeCmd = ( argv: string[] ) => {
  const config = { runHook: vi.fn().mockResolvedValue( { failures: [], successes: [] } ) } as any;
  const cmd = new WorkflowInput( argv, config );
  cmd.log = vi.fn() as any;
  cmd.logToStderr = vi.fn() as any;
  cmd.error = vi.fn().mockImplementation( ( msg: string ) => {
    throw new Error( msg );
  } ) as any;
  cmd.jsonEnabled = vi.fn().mockReturnValue( false ) as any;
  return cmd;
};

describe( 'workflow input command', () => {
  beforeEach( () => vi.clearAllMocks() );
  afterEach( () => vi.restoreAllMocks() );

  describe( 'command definition', () => {
    it( 'exports a valid OCLIF command', () => {
      expect( WorkflowInput.description ).toContain( 'input' );
      expect( WorkflowInput.args ).toHaveProperty( 'workflowId' );
      expect( WorkflowInput.enableJsonFlag ).toBe( true );
    } );
  } );

  describe( 'fetching input', () => {
    it( 'prints the bare input JSON to stdout and returns it for the latest run', async () => {
      vi.mocked( getWorkflowIdInput ).mockResolvedValue(
        { data: { workflowId: 'wf-1', runId: RID, input: INPUT } } as any
      );

      const cmd = makeCmd( [ 'wf-1' ] );
      const result = await cmd.run();

      expect( getWorkflowIdInput ).toHaveBeenCalledWith( 'wf-1' );
      expect( getWorkflowIdRunsRidInput ).not.toHaveBeenCalled();
      expect( cmd.log ).toHaveBeenCalledWith( JSON.stringify( INPUT, null, 2 ) );
      // run() returns the bare input (not the envelope), so --json emits the same shape.
      expect( result ).toEqual( INPUT );
    } );

    it( 'returns the bare input and skips manual logging in --json mode', async () => {
      vi.mocked( getWorkflowIdInput ).mockResolvedValue(
        { data: { workflowId: 'wf-1', runId: RID, input: INPUT } } as any
      );

      const cmd = makeCmd( [ 'wf-1', '--json' ] );
      ( cmd.jsonEnabled as any ).mockReturnValue( true );
      const result = await cmd.run();

      expect( cmd.log ).not.toHaveBeenCalled();
      expect( result ).toEqual( INPUT );
    } );

    it( 'uses the run-pinned endpoint when --run-id is given', async () => {
      vi.mocked( getWorkflowIdRunsRidInput ).mockResolvedValue(
        { data: { workflowId: 'wf-1', runId: RID, input: INPUT } } as any
      );

      const cmd = makeCmd( [ 'wf-1', '--run-id', RID ] );
      await cmd.run();

      expect( getWorkflowIdRunsRidInput ).toHaveBeenCalledWith( 'wf-1', RID );
      expect( getWorkflowIdInput ).not.toHaveBeenCalled();
    } );

    it( 'prints null when no input is available', async () => {
      vi.mocked( getWorkflowIdInput ).mockResolvedValue(
        { data: { workflowId: 'wf-1', runId: RID, input: null } } as any
      );

      const cmd = makeCmd( [ 'wf-1' ] );
      await cmd.run();

      expect( cmd.log ).toHaveBeenCalledWith( 'null' );
    } );
  } );

  describe( 'writing to a file', () => {
    beforeEach( () => {
      vi.mocked( getWorkflowIdInput ).mockResolvedValue(
        { data: { workflowId: 'wf-1', runId: RID, input: INPUT } } as any
      );
    } );

    it( 'writes the input JSON to the output file', async () => {
      vi.mocked( fs.access ).mockRejectedValue( new Error( 'not found' ) );
      vi.mocked( fs.writeFile ).mockResolvedValue();

      const cmd = makeCmd( [ 'wf-1', '-o', 'out.json' ] );
      await cmd.run();

      expect( fs.writeFile ).toHaveBeenCalledWith(
        expect.stringContaining( 'out.json' ),
        `${JSON.stringify( INPUT, null, 2 )}\n`,
        'utf-8'
      );
      expect( cmd.log ).not.toHaveBeenCalled();
      expect( cmd.logToStderr ).toHaveBeenCalledWith( expect.stringContaining( 'out.json' ) );
    } );

    it( 'refuses to overwrite an existing file without --force', async () => {
      vi.mocked( fs.access ).mockResolvedValue();

      const cmd = makeCmd( [ 'wf-1', '-o', 'out.json' ] );

      await expect( cmd.run() ).rejects.toThrow( 'File already exists' );
      expect( fs.writeFile ).not.toHaveBeenCalled();
    } );

    it( 'overwrites an existing file when --force is set', async () => {
      vi.mocked( fs.access ).mockResolvedValue();
      vi.mocked( fs.writeFile ).mockResolvedValue();

      const cmd = makeCmd( [ 'wf-1', '-o', 'out.json', '--force' ] );
      await cmd.run();

      expect( fs.writeFile ).toHaveBeenCalled();
    } );
  } );

  describe( 'error handling', () => {
    it( 'maps a 404 to a friendly message', async () => {
      const cmd = makeCmd( [ 'wf-1' ] );
      const apiError = Object.assign( new Error( 'Not Found' ), { response: { status: 404 } } );

      await expect( cmd.catch( apiError ) ).rejects.toThrow( 'Workflow not found' );
    } );
  } );
} );
