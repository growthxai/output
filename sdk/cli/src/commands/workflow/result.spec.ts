/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock( '#api/generated/api.js', () => ( {
  getWorkflowIdResult: vi.fn()
} ) );

describe( 'workflow result command', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  } );

  describe( 'command definition', () => {
    it( 'should export a valid OCLIF command', async () => {
      const WorkflowResult = ( await import( './result.js' ) ).default;
      expect( WorkflowResult ).toBeDefined();
      expect( WorkflowResult.description ).toContain( 'Get workflow execution result' );
      expect( WorkflowResult.args ).toHaveProperty( 'workflowId' );
    } );

    it( 'enables the built-in --json flag', async () => {
      const WorkflowResult = ( await import( './result.js' ) ).default;
      expect( WorkflowResult.enableJsonFlag ).toBe( true );
    } );
  } );

  describe( 'run()', () => {
    const runCommand = async ( data: Record<string, unknown> ) => {
      const WorkflowResult = ( await import( './result.js' ) ).default;
      const { getWorkflowIdResult } = await import( '#api/generated/api.js' );
      const cmd = new WorkflowResult( [ 'wf-1' ], {} as any );
      cmd.log = vi.fn();
      ( cmd as any ).parse = vi.fn().mockResolvedValue( { args: { workflowId: 'wf-1' } } );
      vi.mocked( getWorkflowIdResult ).mockResolvedValue( {
        data,
        status: 200,
        headers: new Headers()
      } as any );

      const result = await cmd.run();
      return { cmd, result, getWorkflowIdResult };
    };

    it( 'returns and formats a legacy result', async () => {
      const data = {
        workflowId: 'wf-1',
        runId: 'run-1',
        status: 'failed',
        input: {},
        output: null,
        trace: null,
        error: 'Legacy failure',
        errorDetails: null
      };

      const { cmd, result, getWorkflowIdResult } = await runCommand( data );

      expect( getWorkflowIdResult ).toHaveBeenCalledWith( 'wf-1' );
      expect( cmd.log ).toHaveBeenCalledWith( expect.stringContaining( 'Error: Legacy failure' ) );
      expect( result ).toEqual( data );
      expect( process.exitCode ).toBe( 1 );
    } );

    it( 'returns and formats a current result', async () => {
      const data = {
        v: '2',
        workflowId: 'wf-1',
        runId: 'run-1',
        status: 'failed',
        input: {},
        output: null,
        trace: null,
        error: { name: 'ValidationError', message: 'Invalid input' }
      };

      const { result } = await runCommand( data );

      expect( result ).toEqual( data );
      expect( process.exitCode ).toBe( 1 );
    } );

    it( 'sets a failure exit code for the previous canceled spelling', async () => {
      const data = {
        workflowId: 'wf-1',
        runId: 'run-1',
        status: 'canceled',
        input: {},
        output: null,
        trace: null,
        error: 'Workflow was canceled',
        errorDetails: null
      };

      await runCommand( data );

      expect( process.exitCode ).toBe( 1 );
    } );
  } );
} );
