import { Args, Command, Flags } from '@oclif/core';
import { postWorkflowStart, type PostWorkflowStart200 } from '#api/generated/api.js';
import { commandStreamIo, monitorErrorOverrides, streamWorkflowUpdates } from '#services/monitor_stream.js';
import { handleApiError, handleCommandError } from '#utils/error_handler.js';
import { isErrorStatus } from '#utils/format_workflow_result.js';
import { gatedMonitorStreamFlags, MONITOR_DEFAULTS } from '#utils/monitor_flags.js';
import { resolveInput } from '#utils/resolve_input.js';

/**
 * Distinct from 1 (the workflow itself failed) and 2 (usage): the workflow was
 * started and is still running, only the attached stream gave up. A caller that
 * retries on exit 1 would otherwise re-submit a workflow that is already running.
 */
const MONITOR_FAILED_EXIT_CODE = 3;

export default class WorkflowStart extends Command {
  static override description = 'Start a workflow asynchronously without waiting for completion';

  static override enableJsonFlag = true;

  static override examples = [
    '<%= config.bin %> <%= command.id %> simple basic_input',
    '<%= config.bin %> <%= command.id %> simple --input \'{"values":[1,2,3]}\'',
    '<%= config.bin %> <%= command.id %> simple --input input.json',
    '<%= config.bin %> <%= command.id %> simple --input input.json --monitor',
    '<%= config.bin %> <%= command.id %> simple --input \'{"key":"value"}\' --catalog my-catalog',
    '<%= config.bin %> <%= command.id %> simple --json'
  ];

  static override args = {
    workflowName: Args.string( {
      description: 'Name of the workflow to start',
      required: true
    } ),
    scenario: Args.string( {
      description: 'Scenario name (resolved from the workflow\'s scenarios/ directory)',
      required: false
    } )
  };

  static override flags = {
    input: Flags.string( {
      char: 'i',
      description: 'Workflow input as JSON string or file path (overrides scenario)',
      required: false
    } ),
    catalog: Flags.string( {
      char: 'c',
      aliases: [ 'task-queue' ],
      charAliases: [ 'q' ],
      deprecateAliases: true,
      description: 'Catalog name for workflow execution (defaults to OUTPUT_CATALOG_ID)',
      env: 'OUTPUT_CATALOG_ID'
    } ),
    // No `default: false`: a defaulted flag counts as present, so it would
    // satisfy the `dependsOn` guard the three flags in `gatedMonitorStreamFlags`
    // point at, letting `--interval` and friends be accepted (and then ignored)
    // on a plain `workflow start`. Those three omit their own defaults for a
    // different reason — see `gatedMonitorStreamFlags`.
    //
    // No `exclusive: [ 'json' ]` either: oclif's own rejection would fire first
    // and print a bare "--json=true cannot also be provided", pre-empting the
    // guard in `run()` that explains what to use instead. That guard covers both
    // triggers (`--json` on argv, and `CONTENT_TYPE=json`) with one message.
    monitor: Flags.boolean( {
      char: 'm',
      description: 'After starting, attach and stream status updates until the workflow ends ' +
        '(Ctrl+C detaches; the workflow keeps running). Cannot be combined with --json'
    } ),
    ...gatedMonitorStreamFlags( 'monitor' )
  };

  async run(): Promise<PostWorkflowStart200> {
    const { args, flags } = await this.parse( WorkflowStart );

    // The built-in `--json` flag is injected by `enableJsonFlag`, and
    // `CONTENT_TYPE=json` turns it on without it appearing on argv at all, so
    // this runtime check — not an oclif flag relationship — is what catches
    // every route into json mode. Streaming under `--json` is worse than
    // useless: `Command.log()` is a no-op while json is enabled, so every update
    // would be swallowed and the command would simply hang until the workflow
    // ended.
    if ( flags.monitor && this.jsonEnabled() ) {
      this.error(
        'Cannot combine --monitor with --json. Use "workflow run --json" to wait for the result, ' +
        'or "workflow monitor <id> --format json" to stream newline-delimited JSON.',
        { exit: 2 }
      );
    }

    const input = await resolveInput( {
      workflowName: args.workflowName,
      scenario: args.scenario,
      inputFlag: flags.input,
      commandName: 'start',
      catalog: flags.catalog,
      json: this.jsonEnabled()
    } );

    this.log( `Starting workflow: ${args.workflowName}...` );

    const response = await postWorkflowStart( {
      workflowName: args.workflowName,
      input,
      catalog: flags.catalog
    } );

    if ( !response || !response.data ) {
      this.error( 'API returned invalid response', { exit: 1 } );
    }

    const result = response.data as PostWorkflowStart200;
    const started = [
      'Workflow started successfully',
      '',
      `Workflow ID: ${result.workflowId || 'unknown'}`
    ];

    if ( !flags.monitor ) {
      this.log( `\n${[
        ...started,
        '',
        `Use "workflow status ${result.workflowId || '<workflow-id>'}" to check the workflow status`,
        `Use "workflow result ${result.workflowId || '<workflow-id>'}" to get the workflow result when complete`
      ].join( '\n' )}` );
      return result;
    }

    // Checked before the banner prints: "Workflow started successfully" followed
    // immediately by a failure contradicts itself, and the `unknown` placeholder
    // id it would show is not something the user can act on. Exit 3, not 1 — the
    // start itself succeeded, so this is the "started but unmonitorable" case.
    if ( !result.workflowId ) {
      this.error(
        'The workflow was started, but the API did not return a workflow ID, so it cannot be monitored. ' +
        'Use "workflow runs list" to find it.',
        { exit: MONITOR_FAILED_EXIT_CODE }
      );
    }

    this.log( `\n${started.join( '\n' )}` );
    this.log( '' );

    try {
      const status = await streamWorkflowUpdates( {
        workflowId: result.workflowId,
        // Pin to the run just started rather than letting the monitor resolve
        // "latest run" — with a retry or a rapid re-start those can differ.
        runId: result.runId ?? undefined,
        includePayloads: flags['include-payloads'] ?? MONITOR_DEFAULTS.includePayloads,
        interval: flags.interval ?? MONITOR_DEFAULTS.interval,
        // Always text: monitoring under json mode is rejected above, so the
        // NDJSON path is `workflow monitor --format json`.
        json: false,
        color: flags.color ?? MONITOR_DEFAULTS.color
      }, commandStreamIo( this ) );

      // Monitoring reports the workflow's *progress*; the return value still has
      // to be fetched separately, so name the command that does it. A failed run
      // has no result to fetch, so point at the one that explains the failure.
      if ( status ) {
        this.log( isErrorStatus( status ) ?
          `\nUse "workflow debug ${result.workflowId}" to inspect the failure` :
          `\nUse "workflow result ${result.workflowId}" to get the workflow result` );
      }
    } catch ( error ) {
      // The workflow was started and is still running — only the stream gave up.
      // Say so explicitly and exit on a code of its own, so this can't be read
      // (by a human or by a CI job retrying on exit 1) as a failed start.
      //
      // `handleApiError`, not `handleCommandError`: an error the stream raised
      // through `io.error` is already a CLIError, and passing it through would
      // report it as a plain exit-1 failure rather than a live workflow.
      handleApiError(
        error,
        message => this.error(
          `Workflow ${result.workflowId} started, but monitoring stopped:\n${message}\n` +
          `The workflow is still running. Use "workflow status ${result.workflowId}" to check on it.`,
          { exit: MONITOR_FAILED_EXIT_CODE }
        ),
        monitorErrorOverrides( error as Error )
      );
    }

    return result;
  }

  async catch( error: Error ): Promise<void> {
    return handleCommandError( error, ( ...args ) => this.error( ...args ), {
      404: 'Workflow not found. Check the workflow name.'
    } );
  }
}
