/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock( '#api/generated/api.js', () => ( {
  postWorkflowStart: vi.fn()
} ) );

vi.mock( '#utils/resolve_input.js', () => ( {
  resolveInput: vi.fn()
} ) );

// Only the streaming loop is stubbed; DEFAULT_INTERVAL_MS and monitorErrorOverrides
// stay real so the default-application and error-mapping branches are exercised
// against the values `workflow monitor` actually uses.
vi.mock( '#services/monitor_stream.js', async importOriginal => ( {
  ...await importOriginal<typeof import( '#services/monitor_stream.js' )>(),
  streamWorkflowUpdates: vi.fn()
} ) );

describe( 'workflow start command', () => {
  beforeEach( async () => {
    vi.clearAllMocks();
    delete process.env.OUTPUT_CATALOG_ID;
    const { resolveInput } = await import( '#utils/resolve_input.js' );
    vi.mocked( resolveInput ).mockResolvedValue( {} );
  } );

  describe( 'command definition', () => {
    it( 'should export a valid OCLIF command', async () => {
      const WorkflowStart = ( await import( './start.js' ) ).default;
      expect( WorkflowStart ).toBeDefined();
      expect( WorkflowStart.description ).toContain( 'Start a workflow' );
      expect( WorkflowStart.args ).toHaveProperty( 'workflowName' );
      expect( WorkflowStart.flags ).toHaveProperty( 'input' );
      expect( WorkflowStart.flags ).toHaveProperty( 'catalog' );
    } );

    it( 'should have correct flag configuration', async () => {
      const WorkflowStart = ( await import( './start.js' ) ).default;
      expect( WorkflowStart.flags.input.required ).toBe( false );
    } );

    it( 'should have optional scenario argument', async () => {
      const WorkflowStart = ( await import( './start.js' ) ).default;
      expect( WorkflowStart.args ).toHaveProperty( 'scenario' );
      expect( WorkflowStart.args.scenario.required ).toBe( false );
    } );

    it( 'binds the catalog flag to OUTPUT_CATALOG_ID', async () => {
      const WorkflowStart = ( await import( './start.js' ) ).default;
      expect( WorkflowStart.flags.catalog.env ).toBe( 'OUTPUT_CATALOG_ID' );
      expect( WorkflowStart.flags.catalog.char ).toBe( 'c' );
    } );

    it( 'enables the built-in --json flag', async () => {
      const WorkflowStart = ( await import( './start.js' ) ).default;
      expect( WorkflowStart.enableJsonFlag ).toBe( true );
    } );

    it( 'exposes --monitor with no default so dependsOn stays enforceable', async () => {
      const WorkflowStart = ( await import( './start.js' ) ).default;
      expect( WorkflowStart.flags.monitor.char ).toBe( 'm' );
      // An oclif default counts as "provided", which would silently satisfy the
      // dependsOn guards below and let --interval through without --monitor.
      expect( WorkflowStart.flags.monitor.default ).toBeUndefined();
    } );

    it( 'declares --monitor exclusive with --json', async () => {
      const WorkflowStart = ( await import( './start.js' ) ).default;
      // Streaming under --json is silently useless: oclif's Command.log() is a
      // no-op while json is enabled, so every update would be swallowed.
      expect( WorkflowStart.flags.monitor.exclusive ).toEqual( [ 'json' ] );
    } );

    it( 'gates every monitor passthrough flag behind --monitor and leaves them undefaulted', async () => {
      const WorkflowStart = ( await import( './start.js' ) ).default;
      for ( const name of [ 'interval', 'include-payloads', 'color' ] as const ) {
        expect( WorkflowStart.flags[name].dependsOn ).toEqual( [ 'monitor' ] );
        expect( WorkflowStart.flags[name].default ).toBeUndefined();
      }
    } );
  } );

  describe( 'run()', () => {
    const createCommand = async ( flagOverrides: Record<string, unknown> = {}, argv = [ 'my_workflow' ] ) => {
      const WorkflowStart = ( await import( './start.js' ) ).default;
      const { postWorkflowStart } = await import( '#api/generated/api.js' );
      const { resolveInput } = await import( '#utils/resolve_input.js' );

      const cmd = new WorkflowStart( argv, {} as any );
      cmd.log = vi.fn();
      cmd.error = vi.fn( () => {
        throw new Error( 'error called' );
      } ) as any;
      ( cmd as any ).parse = vi.fn().mockResolvedValue( {
        args: { workflowName: 'my_workflow', scenario: undefined },
        flags: { input: undefined, catalog: undefined, ...flagOverrides }
      } );

      return { cmd, postWorkflowStart: vi.mocked( postWorkflowStart ), resolveInput: vi.mocked( resolveInput ) };
    };

    it( 'threads the resolved catalog to resolveInput and postWorkflowStart', async () => {
      const { cmd, postWorkflowStart, resolveInput } = await createCommand( { catalog: 'my-catalog' } );
      resolveInput.mockResolvedValue( { key: 'value' } );
      postWorkflowStart.mockResolvedValue( {
        data: { workflowId: 'wf-123' },
        status: 200,
        headers: new Headers()
      } as any );

      const result = await cmd.run();

      expect( resolveInput ).toHaveBeenCalledWith( expect.objectContaining( {
        workflowName: 'my_workflow',
        commandName: 'start',
        catalog: 'my-catalog',
        json: false
      } ) );
      expect( postWorkflowStart ).toHaveBeenCalledWith(
        expect.objectContaining( { workflowName: 'my_workflow', catalog: 'my-catalog' } )
      );
      expect( result ).toEqual( { workflowId: 'wf-123' } );
    } );

    it( 'passes undefined catalog through when none is set', async () => {
      const { cmd, postWorkflowStart, resolveInput } = await createCommand();
      resolveInput.mockResolvedValue( {} );
      postWorkflowStart.mockResolvedValue( {
        data: { workflowId: 'wf-123' },
        status: 200,
        headers: new Headers()
      } as any );

      await cmd.run();

      expect( resolveInput ).toHaveBeenCalledWith( expect.objectContaining( {
        workflowName: 'my_workflow',
        commandName: 'start',
        catalog: undefined
      } ) );
    } );

    it( 'tells resolveInput to stay quiet when --json is set', async () => {
      const { cmd, postWorkflowStart, resolveInput } = await createCommand( {}, [ 'my_workflow', 'basic', '--json' ] );
      resolveInput.mockResolvedValue( {} );
      postWorkflowStart.mockResolvedValue( {
        data: { workflowId: 'wf-123' },
        status: 200,
        headers: new Headers()
      } as any );

      await cmd.run();

      expect( resolveInput ).toHaveBeenCalledWith( expect.objectContaining( { json: true } ) );
    } );

    describe( '--monitor', () => {
      const startResponse = ( data: Record<string, unknown> ) => ( {
        data, status: 200, headers: new Headers()
      } as any );

      it( 'does not attach when the flag is absent, and keeps the follow-up hints', async () => {
        const { cmd, postWorkflowStart } = await createCommand();
        const { streamWorkflowUpdates } = await import( '#services/monitor_stream.js' );
        postWorkflowStart.mockResolvedValue( startResponse( { workflowId: 'wf-123', runId: 'run-1' } ) );

        await cmd.run();

        expect( streamWorkflowUpdates ).not.toHaveBeenCalled();
        const printed = ( cmd.log as any ).mock.calls.map( ( [ line ]: [ string ] ) => line ).join( '\n' );
        expect( printed ).toContain( 'workflow status wf-123' );
        expect( printed ).toContain( 'workflow result wf-123' );
      } );

      it( 'streams updates pinned to the run it just started', async () => {
        const { cmd, postWorkflowStart } = await createCommand( { monitor: true } );
        const { streamWorkflowUpdates } = await import( '#services/monitor_stream.js' );
        postWorkflowStart.mockResolvedValue( startResponse( { workflowId: 'wf-123', runId: 'run-1' } ) );

        await cmd.run();

        expect( streamWorkflowUpdates ).toHaveBeenCalledWith(
          // runId is pinned rather than left undefined so a rapid re-start can't
          // make the monitor resolve "latest run" to a different execution.
          expect.objectContaining( { workflowId: 'wf-123', runId: 'run-1', json: false } ),
          expect.objectContaining( { log: expect.any( Function ), error: expect.any( Function ) } )
        );
      } );

      it( 'still returns the start result after monitoring finishes', async () => {
        const { cmd, postWorkflowStart } = await createCommand( { monitor: true } );
        postWorkflowStart.mockResolvedValue( startResponse( { workflowId: 'wf-123', runId: 'run-1' } ) );

        await expect( cmd.run() ).resolves.toEqual( { workflowId: 'wf-123', runId: 'run-1' } );
      } );

      it( 'drops the status/result hints that duplicate what monitoring already does', async () => {
        const { cmd, postWorkflowStart } = await createCommand( { monitor: true } );
        postWorkflowStart.mockResolvedValue( startResponse( { workflowId: 'wf-123', runId: 'run-1' } ) );

        await cmd.run();

        const printed = ( cmd.log as any ).mock.calls.map( ( [ line ]: [ string ] ) => line ).join( '\n' );
        expect( printed ).toContain( 'Workflow ID: wf-123' );
        expect( printed ).not.toContain( 'workflow status wf-123' );
        expect( printed ).not.toContain( 'workflow result wf-123' );
      } );

      it( 'applies monitor defaults for the passthrough flags left unset', async () => {
        const { cmd, postWorkflowStart } = await createCommand( { monitor: true } );
        const { streamWorkflowUpdates } = await import( '#services/monitor_stream.js' );
        postWorkflowStart.mockResolvedValue( startResponse( { workflowId: 'wf-123' } ) );

        await cmd.run();

        // These carry no oclif default (that would defeat dependsOn), so run() must supply them.
        expect( streamWorkflowUpdates ).toHaveBeenCalledWith(
          expect.objectContaining( { interval: 2500, color: true, includePayloads: false } ),
          expect.anything()
        );
      } );

      it( 'forwards explicit passthrough flag values', async () => {
        const { cmd, postWorkflowStart } = await createCommand( {
          monitor: true, interval: 500, color: false, 'include-payloads': true
        } );
        const { streamWorkflowUpdates } = await import( '#services/monitor_stream.js' );
        postWorkflowStart.mockResolvedValue( startResponse( { workflowId: 'wf-123' } ) );

        await cmd.run();

        expect( streamWorkflowUpdates ).toHaveBeenCalledWith(
          expect.objectContaining( { interval: 500, color: false, includePayloads: true } ),
          expect.anything()
        );
      } );

      it( 'leaves runId undefined when the API omits it, falling back to the latest run', async () => {
        const { cmd, postWorkflowStart } = await createCommand( { monitor: true } );
        const { streamWorkflowUpdates } = await import( '#services/monitor_stream.js' );
        postWorkflowStart.mockResolvedValue( startResponse( { workflowId: 'wf-123', runId: null } ) );

        await cmd.run();

        expect( streamWorkflowUpdates ).toHaveBeenCalledWith(
          expect.objectContaining( { runId: undefined } ),
          expect.anything()
        );
      } );

      it( 'errors instead of monitoring when the API returns no workflow ID', async () => {
        const { cmd, postWorkflowStart } = await createCommand( { monitor: true } );
        const { streamWorkflowUpdates } = await import( '#services/monitor_stream.js' );
        postWorkflowStart.mockResolvedValue( startResponse( { runId: 'run-1' } ) );

        await expect( cmd.run() ).rejects.toThrow();
        expect( streamWorkflowUpdates ).not.toHaveBeenCalled();
      } );

      it( 'refuses to monitor under --json instead of silently swallowing the stream', async () => {
        const { cmd, postWorkflowStart } = await createCommand( { monitor: true } );
        const { streamWorkflowUpdates } = await import( '#services/monitor_stream.js' );
        // CONTENT_TYPE=json enables json mode without --json ever reaching argv,
        // so oclif's `exclusive` check has nothing to reject — this guard catches it.
        vi.spyOn( cmd, 'jsonEnabled' ).mockReturnValue( true );

        await expect( cmd.run() ).rejects.toThrow();

        expect( cmd.error ).toHaveBeenCalledWith(
          expect.stringContaining( 'Cannot combine --monitor with --json' ),
          expect.objectContaining( { exit: 2 } )
        );
        expect( postWorkflowStart ).not.toHaveBeenCalled();
        expect( streamWorkflowUpdates ).not.toHaveBeenCalled();
      } );

      const notFound = () => Object.assign( new Error( 'not found' ), { response: { status: 404 } } );

      it( 'blames the workflow name for a 404 raised before monitoring begins', async () => {
        const { cmd } = await createCommand();

        await expect( cmd.catch( notFound() ) ).rejects.toThrow();

        expect( cmd.error ).toHaveBeenCalledWith(
          'Workflow not found. Check the workflow name.',
          expect.objectContaining( { exit: 1 } )
        );
      } );

      it( 'blames the workflow ID once monitoring has begun, since the name already resolved', async () => {
        const { cmd, postWorkflowStart } = await createCommand( { monitor: true } );
        const { streamWorkflowUpdates } = await import( '#services/monitor_stream.js' );
        postWorkflowStart.mockResolvedValue( startResponse( { workflowId: 'wf-123' } ) );
        const error = notFound();
        vi.mocked( streamWorkflowUpdates ).mockRejectedValue( error );

        await expect( cmd.run() ).rejects.toThrow();
        await expect( cmd.catch( error ) ).rejects.toThrow();

        // The workflow started fine, so a 404 here is about the run being polled.
        expect( cmd.error ).toHaveBeenCalledWith(
          'Workflow not found. Check the workflow ID.',
          expect.objectContaining( { exit: 1 } )
        );
      } );
    } );
  } );
} );
