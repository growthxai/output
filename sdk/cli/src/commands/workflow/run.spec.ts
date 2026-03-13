/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpError } from '#api/http_client.js';

vi.mock( '#api/generated/api.js', () => ( {
  postWorkflowRun: vi.fn()
} ) );

vi.mock( '#utils/resolve_input.js', () => ( {
  resolveInput: vi.fn()
} ) );

vi.mock( '#utils/sleep.js', () => ( {
  sleep: vi.fn().mockResolvedValue( undefined )
} ) );

describe( 'workflow run command', () => {
  beforeEach( async () => {
    vi.clearAllMocks();
    const { resolveInput } = await import( '#utils/resolve_input.js' );
    const { sleep } = await import( '#utils/sleep.js' );
    vi.mocked( resolveInput ).mockResolvedValue( {} );
    vi.mocked( sleep ).mockResolvedValue( undefined );
  } );

  describe( 'command definition', () => {
    it( 'should export a valid OCLIF command', async () => {
      const WorkflowRun = ( await import( './run.js' ) ).default;
      expect( WorkflowRun ).toBeDefined();
      expect( WorkflowRun.description ).toContain( 'Execute a workflow' );
      expect( WorkflowRun.args ).toHaveProperty( 'workflowName' );
      expect( WorkflowRun.flags ).toHaveProperty( 'input' );
      expect( WorkflowRun.flags ).toHaveProperty( 'format' );
      expect( WorkflowRun.flags ).toHaveProperty( 'task-queue' );
    } );

    it( 'should have correct flag configuration', async () => {
      const WorkflowRun = ( await import( './run.js' ) ).default;
      expect( WorkflowRun.flags.format.options ).toEqual( [ 'json', 'text' ] );
      expect( WorkflowRun.flags.format.default ).toBe( 'text' );
      expect( WorkflowRun.flags.input.required ).toBe( false );
    } );

    it( 'should have optional scenario argument', async () => {
      const WorkflowRun = ( await import( './run.js' ) ).default;
      expect( WorkflowRun.args ).toHaveProperty( 'scenario' );
      expect( WorkflowRun.args.scenario.required ).toBe( false );
    } );
  } );

  describe( 'run()', () => {
    const createCommand = async () => {
      const WorkflowRun = ( await import( './run.js' ) ).default;
      const { postWorkflowRun } = await import( '#api/generated/api.js' );
      const { resolveInput } = await import( '#utils/resolve_input.js' );

      const cmd = new WorkflowRun( [ 'my_workflow' ], {} as any );
      cmd.log = vi.fn();
      cmd.error = vi.fn( () => {
        throw new Error( 'error called' );
      } ) as any;
      ( cmd as any ).parse = vi.fn().mockResolvedValue( {
        args: { workflowName: 'my_workflow', scenario: undefined },
        flags: { input: undefined, 'task-queue': undefined, format: 'text' }
      } );

      return { cmd, postWorkflowRun: vi.mocked( postWorkflowRun ), resolveInput: vi.mocked( resolveInput ) };
    };

    it( 'calls postWorkflowRun and logs output on success', async () => {
      const { cmd, postWorkflowRun, resolveInput } = await createCommand();
      resolveInput.mockResolvedValue( { key: 'value' } );
      postWorkflowRun.mockResolvedValue( {
        data: { status: 'completed', result: { output: 'ok' } },
        status: 200,
        headers: new Headers()
      } as any );

      await cmd.run();

      expect( postWorkflowRun ).toHaveBeenCalledTimes( 1 );
      expect( postWorkflowRun ).toHaveBeenCalledWith(
        { workflowName: 'my_workflow', input: { key: 'value' }, taskQueue: undefined },
        expect.objectContaining( { config: { timeout: 600000 } } )
      );
      expect( cmd.log ).toHaveBeenCalledWith( 'Executing workflow: my_workflow...' );
      expect( cmd.log ).toHaveBeenCalledWith( expect.stringMatching( /\n/ ) );
    } );

    it( 'retries when response has Retry-After and succeeds on second attempt', async () => {
      const { cmd, postWorkflowRun, resolveInput } = await createCommand();
      resolveInput.mockResolvedValue( {} );
      const headers = new Headers( { 'Retry-After': '1' } );
      postWorkflowRun
        .mockRejectedValueOnce( new HttpError( 'Unavailable', { status: 503, headers } ) )
        .mockResolvedValueOnce( {
          data: { status: 'completed', result: {} },
          status: 200,
          headers: new Headers()
        } as any );

      await cmd.run();

      expect( postWorkflowRun ).toHaveBeenCalledTimes( 2 );
      expect( cmd.log ).toHaveBeenCalledWith( expect.stringMatching( /Retry-After.*Retrying in/ ) );
    } );

    it( 'does not retry when response has no Retry-After and throws', async () => {
      const { cmd, postWorkflowRun, resolveInput } = await createCommand();
      resolveInput.mockResolvedValue( {} );
      postWorkflowRun.mockRejectedValue(
        new HttpError( 'Unavailable', { status: 503, headers: new Headers() } )
      );

      await expect( cmd.run() ).rejects.toThrow( HttpError );

      expect( postWorkflowRun ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'does not retry on non-503 error and throws', async () => {
      const { cmd, postWorkflowRun, resolveInput } = await createCommand();
      resolveInput.mockResolvedValue( {} );
      postWorkflowRun.mockRejectedValue( new HttpError( 'Not found', { status: 404 } ) );

      await expect( cmd.run() ).rejects.toThrow( HttpError );

      expect( postWorkflowRun ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'calls error when API returns no data', async () => {
      const { cmd, postWorkflowRun, resolveInput } = await createCommand();
      resolveInput.mockResolvedValue( {} );
      postWorkflowRun.mockResolvedValue( { data: undefined, status: 200, headers: new Headers() } as any );

      await expect( cmd.run() ).rejects.toThrow( 'error called' );

      expect( cmd.error ).toHaveBeenCalledWith( 'API returned invalid response', { exit: 1 } );
    } );
  } );
} );
