/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowNotFoundError } from '@temporalio/client';
import WorkflowDebug from './debug.js';
import { collectWorkflowDebug } from '#services/workflow_debug.js';
import { createTemporalClient } from '#services/temporal_client.js';

vi.mock( '#services/workflow_debug.js', () => ( { collectWorkflowDebug: vi.fn() } ) );
vi.mock( '#services/temporal_client.js', async importOriginal => ( {
  ...await importOriginal<typeof import( '#services/temporal_client.js' )>(),
  createTemporalClient: vi.fn()
} ) );

describe( 'workflow debug command', () => {
  it( 'takes a required workflow id and an optional run id', () => {
    expect( WorkflowDebug.args.workflowId.required ).toBe( true );
    expect( WorkflowDebug.flags['run-id'].required ).toBeFalsy();
    expect( WorkflowDebug.flags['run-id'].char ).toBe( 'r' );
  } );

  it( 'shares the Temporal connection flags', () => {
    expect( Object.keys( WorkflowDebug.flags ) ).toEqual( expect.arrayContaining( [ 'profile', 'address', 'namespace' ] ) );
  } );

  it( 'accepts --json as a hidden flag and does not hand output to the framework', () => {
    expect( WorkflowDebug.enableJsonFlag ).toBeFalsy();
    expect( WorkflowDebug.flags.json.hidden ).toBe( true );
  } );

  describe( 'run()', () => {
    const result = { complete: true, warnings: [], temporal: { address: 'a:1', namespace: 'default' }, workflows: [] };
    const close = vi.fn();

    const createCommand = ( flags: Record<string, unknown> = {} ) => {
      const cmd = new WorkflowDebug( [ 'wf-1' ], {} as any );
      cmd.log = vi.fn();
      ( cmd as any ).parse = vi.fn().mockResolvedValue( { args: { workflowId: 'wf-1' }, flags: { 'run-id': undefined, ...flags } } );
      return cmd;
    };

    beforeEach( () => {
      vi.clearAllMocks();
      close.mockResolvedValue( undefined );
      vi.mocked( createTemporalClient ).mockResolvedValue( { client: {}, address: 'a:1', namespace: 'default', close } as any );
      vi.mocked( collectWorkflowDebug ).mockResolvedValue( result as any );
    } );

    it( 'prints the result as a single line of JSON and nothing else', async () => {
      const cmd = createCommand();

      await cmd.run();

      expect( cmd.log ).toHaveBeenCalledTimes( 1 );
      expect( cmd.log ).toHaveBeenCalledWith( JSON.stringify( result ) );
    } );

    it( 'connects with the Temporal flags and reads the requested run', async () => {
      const flags = { 'run-id': 'run-9', profile: 'prod', address: 'x:1', namespace: 'ns' };

      await createCommand( flags ).run();

      expect( createTemporalClient ).toHaveBeenCalledWith( expect.objectContaining( { profile: 'prod', address: 'x:1', namespace: 'ns' } ) );
      expect( collectWorkflowDebug ).toHaveBeenCalledWith( {}, { address: 'a:1', namespace: 'default', workflowId: 'wf-1', runId: 'run-9' } );
    } );

    it( 'closes the connection after a successful read', async () => {
      await createCommand().run();

      expect( close ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'closes the connection when the read fails and prints nothing', async () => {
      vi.mocked( collectWorkflowDebug ).mockRejectedValue( new Error( 'boom' ) );
      const cmd = createCommand();

      await expect( cmd.run() ).rejects.toThrow( 'boom' );

      expect( close ).toHaveBeenCalledTimes( 1 );
      expect( cmd.log ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'catch()', () => {
    const createCommand = () => {
      const cmd = new WorkflowDebug( [ 'wf-1' ], {} as any );
      cmd.error = vi.fn( ( message: string ) => {
        throw new Error( message );
      } ) as any;
      return cmd;
    };

    it( 'explains a workflow that is not found and exits 1', async () => {
      const cmd = createCommand();

      await expect( cmd.catch( new WorkflowNotFoundError( 'workflow not found for ID: wf-1', 'wf-1', undefined ) ) )
        .rejects.toThrow( 'Workflow not found for ID: wf-1. Check the workflow id, the run id and the namespace.' );

      expect( cmd.error ).toHaveBeenCalledWith( expect.any( String ), { exit: 1 } );
    } );

    it( 'reports any other error as it is and exits 1', async () => {
      const cmd = createCommand();

      const message = 'Cannot connect to Temporal at a:1: refused';

      await expect( cmd.catch( new Error( message ) ) ).rejects.toThrow( message );

      expect( cmd.error ).toHaveBeenCalledWith( message, { exit: 1 } );
    } );
  } );
} );
