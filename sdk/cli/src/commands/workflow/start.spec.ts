/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Parser } from '@oclif/core';
import { CLIError } from '@oclif/core/errors';

vi.mock( '#api/generated/api.js', () => ( {
  postWorkflowStart: vi.fn()
} ) );

vi.mock( '#utils/resolve_input.js', () => ( {
  resolveInput: vi.fn()
} ) );

// Only the streaming loop is stubbed; monitorErrorOverrides and commandStreamIo
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
      // A defaulted flag counts as present, so a default here would satisfy the
      // dependsOn guards below and let --interval through without --monitor.
      expect( WorkflowStart.flags.monitor.default ).toBeUndefined();
    } );

    it( 'leaves the --monitor/--json conflict to the runtime guard', async () => {
      const WorkflowStart = ( await import( './start.js' ) ).default;
      // An `exclusive: [ 'json' ]` relationship would fire first and print a bare
      // "--json=true cannot also be provided", pre-empting the guard in run()
      // that explains what to use instead — and it still wouldn't catch
      // CONTENT_TYPE=json, which never reaches argv.
      expect( WorkflowStart.flags.monitor.exclusive ).toBeUndefined();
    } );

    it( 'gates every monitor passthrough flag behind --monitor and leaves them undefaulted', async () => {
      const WorkflowStart = ( await import( './start.js' ) ).default;
      for ( const name of [ 'interval', 'include-payloads', 'color' ] as const ) {
        expect( WorkflowStart.flags[name].dependsOn ).toEqual( [ 'monitor' ] );
        // A default would count as present and trigger this flag's own dependsOn
        // check, failing every invocation that omits --monitor.
        expect( WorkflowStart.flags[name].default ).toBeUndefined();
      }
    } );

    // The properties asserted above are only the inputs; what matters is what
    // oclif does with them. Parser.parse needs no oclif Config, so the actual
    // gating is cheap to pin — worth doing because the no-default design is
    // subtle enough that someone will try to "fix" it by adding one.
    describe( 'flag parsing', () => {
      const parse = async ( argv: string[] ) => {
        const WorkflowStart = ( await import( './start.js' ) ).default;
        return Parser.parse( argv, { flags: WorkflowStart.flags, strict: false } );
      };

      it( 'accepts a plain start with none of the monitor flags', async () => {
        await expect( parse( [ 'my_workflow' ] ) ).resolves.toBeDefined();
      } );

      it( 'accepts the passthrough flags once --monitor is given', async () => {
        const { flags } = await parse( [ 'my_workflow', '--monitor', '--interval', '500', '--include-payloads' ] );
        expect( flags ).toMatchObject( { monitor: true, interval: 500, 'include-payloads': true } );
      } );

      it( 'rejects a passthrough flag without --monitor', async () => {
        await expect( parse( [ 'my_workflow', '--interval', '500' ] ) ).rejects.toThrow( /--monitor/ );
      } );

      it( 'gates --no-color behind --monitor as well', async () => {
        // A consequence of gating --color, not an independent decision: --no-color
        // is reflexive enough that this is worth stating outright rather than
        // leaving as a surprise.
        await expect( parse( [ 'my_workflow', '--no-color' ] ) ).rejects.toThrow( /--monitor/ );
        await expect( parse( [ 'my_workflow', '--monitor', '--no-color' ] ) )
          .resolves.toMatchObject( { flags: { color: false } } );
      } );

      it( 'rejects an interval below the minimum', async () => {
        await expect( parse( [ 'my_workflow', '--monitor', '--interval', '0' ] ) ).rejects.toThrow();
      } );
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

    const logged = ( cmd: { log: unknown } ): string[] =>
      ( cmd.log as any ).mock.calls.map( ( [ line ]: [ string ] ) => line );

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
        const printed = logged( cmd ).join( '\n' );
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

      it( 'drops the up-front status hint that duplicates what monitoring already does', async () => {
        const { cmd, postWorkflowStart } = await createCommand( { monitor: true } );
        postWorkflowStart.mockResolvedValue( startResponse( { workflowId: 'wf-123', runId: 'run-1' } ) );

        await cmd.run();

        const printed = logged( cmd ).join( '\n' );
        expect( printed ).toContain( 'Workflow ID: wf-123' );
        expect( printed ).not.toContain( 'workflow status wf-123' );
      } );

      it( 'points at "workflow result" once monitoring finishes', async () => {
        const { cmd, postWorkflowStart } = await createCommand( { monitor: true } );
        const { streamWorkflowUpdates } = await import( '#services/monitor_stream.js' );
        postWorkflowStart.mockResolvedValue( startResponse( { workflowId: 'wf-123', runId: 'run-1' } ) );
        vi.mocked( streamWorkflowUpdates ).mockResolvedValue( 'completed' );

        await cmd.run();

        // The stream reports progress, never the return value, so the command
        // that fetches it has to be named somewhere.
        const printed = logged( cmd );
        expect( printed.at( -1 ) ).toContain( 'workflow result wf-123' );
      } );

      it( 'points at "workflow debug" instead when the workflow failed', async () => {
        const { cmd, postWorkflowStart } = await createCommand( { monitor: true } );
        const { streamWorkflowUpdates } = await import( '#services/monitor_stream.js' );
        postWorkflowStart.mockResolvedValue( startResponse( { workflowId: 'wf-123', runId: 'run-1' } ) );
        vi.mocked( streamWorkflowUpdates ).mockResolvedValue( 'failed' );

        await cmd.run();

        // A failed run has no result to fetch.
        const printed = logged( cmd );
        expect( printed.at( -1 ) ).toContain( 'workflow debug wf-123' );
        expect( printed.at( -1 ) ).not.toContain( 'workflow result' );
      } );

      it( 'adds no follow-up hint when the user detached mid-run', async () => {
        const { cmd, postWorkflowStart } = await createCommand( { monitor: true } );
        const { streamWorkflowUpdates } = await import( '#services/monitor_stream.js' );
        postWorkflowStart.mockResolvedValue( startResponse( { workflowId: 'wf-123', runId: 'run-1' } ) );
        // Detaching returns no terminal status; the detach message carries its
        // own hints, so a second one guessing at the outcome would be wrong.
        vi.mocked( streamWorkflowUpdates ).mockResolvedValue( undefined );

        await cmd.run();

        const printed = logged( cmd ).join( '\n' );
        expect( printed ).not.toContain( 'workflow result wf-123' );
        expect( printed ).not.toContain( 'workflow debug wf-123' );
      } );

      it( 'applies monitor defaults for the passthrough flags left unset', async () => {
        const { cmd, postWorkflowStart } = await createCommand( { monitor: true } );
        const { streamWorkflowUpdates } = await import( '#services/monitor_stream.js' );
        const { MONITOR_DEFAULTS } = await import( '#utils/monitor_flags.js' );
        postWorkflowStart.mockResolvedValue( startResponse( { workflowId: 'wf-123' } ) );

        await cmd.run();

        // These carry no oclif default (that would defeat dependsOn), so run() must
        // supply them — asserted against the shared source rather than re-stating
        // the literals, which is exactly how the two commands would drift apart.
        expect( streamWorkflowUpdates ).toHaveBeenCalledWith(
          expect.objectContaining( {
            interval: MONITOR_DEFAULTS.interval,
            color: MONITOR_DEFAULTS.color,
            includePayloads: MONITOR_DEFAULTS.includePayloads
          } ),
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

        const [ message, options ] = ( cmd.error as any ).mock.calls.at( -1 );
        // The start succeeded — only monitoring is impossible — so this is the
        // exit-3 case. Exit 1 here would tell a CI job retrying a failed workflow
        // to re-submit one that is already running.
        expect( message ).toContain( 'started' );
        expect( message ).toContain( 'cannot be monitored' );
        expect( options ).toEqual( expect.objectContaining( { exit: 3 } ) );

        // Claiming success and then failing on the next line contradicts itself,
        // and the "unknown" placeholder id isn't something the user can act on.
        const printed = logged( cmd ).join( '\n' );
        expect( printed ).not.toContain( 'Workflow started successfully' );
        expect( printed ).not.toContain( 'unknown' );
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

      it( 'reports a monitoring failure as a live workflow, not a failed start', async () => {
        const { cmd, postWorkflowStart } = await createCommand( { monitor: true } );
        const { streamWorkflowUpdates } = await import( '#services/monitor_stream.js' );
        postWorkflowStart.mockResolvedValue( startResponse( { workflowId: 'wf-123' } ) );
        vi.mocked( streamWorkflowUpdates ).mockRejectedValue( notFound() );

        await expect( cmd.run() ).rejects.toThrow();

        const [ message, options ] = ( cmd.error as any ).mock.calls.at( -1 );
        // The workflow started fine, so a 404 here is about the run being polled,
        // and the user needs to know the workflow is still running.
        expect( message ).toContain( 'Workflow not found. Check the workflow ID.' );
        expect( message ).toContain( 'wf-123 started, but monitoring stopped' );
        expect( message ).toContain( 'workflow status wf-123' );
        // Exit 3, not 1: a caller retrying on a failed workflow must not
        // re-submit one that is already running.
        expect( options ).toEqual( expect.objectContaining( { exit: 3 } ) );
      } );

      it( 'still reports a live workflow when the stream raises its own CLIError', async () => {
        const { cmd, postWorkflowStart } = await createCommand( { monitor: true } );
        const { streamWorkflowUpdates } = await import( '#services/monitor_stream.js' );
        postWorkflowStart.mockResolvedValue( startResponse( { workflowId: 'wf-123' } ) );
        // What `io.error` produces — e.g. the continue-as-new branch. run() must
        // use handleApiError here, not handleCommandError: the latter rethrows a
        // CLIError untouched, which would surface this as a bare exit 1 and lose
        // the "still running" message entirely.
        vi.mocked( streamWorkflowUpdates ).mockRejectedValue(
          new CLIError( 'Workflow continued as a new run, but the new run ID could not be determined.' )
        );

        await expect( cmd.run() ).rejects.toThrow();

        const [ message, options ] = ( cmd.error as any ).mock.calls.at( -1 );
        expect( message ).toContain( 'wf-123 started, but monitoring stopped' );
        expect( message ).toContain( 'The workflow is still running' );
        expect( options ).toEqual( expect.objectContaining( { exit: 3 } ) );
      } );

      it( 'rethrows oclif errors instead of flattening them to exit 1', async () => {
        const { cmd } = await createCommand();
        // `catch` re-raising a CLIError through handleApiError would discard both
        // its exit code (2 for usage, 3 for a dropped stream) and oclif's own
        // formatted flag-validation output.
        const usageError = new CLIError( 'Cannot combine --monitor with --json.', { exit: 2 } );

        await expect( cmd.catch( usageError ) ).rejects.toBe( usageError );
        expect( cmd.error ).not.toHaveBeenCalled();
      } );
    } );
  } );
} );
