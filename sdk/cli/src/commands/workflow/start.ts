import { Args, Command, Flags } from '@oclif/core';
import { postWorkflowStart, type PostWorkflowStart200 } from '#api/generated/api.js';
import { DEFAULT_INTERVAL_MS, monitorErrorOverrides, streamWorkflowUpdates } from '#services/monitor_stream.js';
import { handleApiError } from '#utils/error_handler.js';
import { resolveInput } from '#utils/resolve_input.js';

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
    // No `default: false` — oclif treats a defaulted flag as "present", which
    // would silently satisfy the `dependsOn: [ 'monitor' ]` guards below and let
    // `--interval` be accepted (and then ignored) without `--monitor`.
    monitor: Flags.boolean( {
      char: 'm',
      description: 'After starting, attach and stream status updates until the workflow ends ' +
        '(Ctrl+C detaches; the workflow keeps running). Cannot be combined with --json',
      exclusive: [ 'json' ]
    } ),
    // The three flags below forward to the monitor stream. They deliberately
    // declare no `default` — `dependsOn` rejects a flag whose value is present,
    // and an oclif default counts as present, so defaulting them here would make
    // every plain `workflow start` fail with "--interval depends on --monitor".
    // Defaults are applied in `run()` instead.
    'include-payloads': Flags.boolean( {
      description: 'Include decoded step input/output payloads (requires --monitor)',
      dependsOn: [ 'monitor' ],
      helpGroup: 'MONITOR'
    } ),
    interval: Flags.integer( {
      description: `Poll interval in milliseconds while monitoring (requires --monitor) [default: ${DEFAULT_INTERVAL_MS}]`,
      dependsOn: [ 'monitor' ],
      helpGroup: 'MONITOR',
      min: 1
    } ),
    color: Flags.boolean( {
      description: 'Colorize status output, use --no-color to disable (requires --monitor)',
      dependsOn: [ 'monitor' ],
      helpGroup: 'MONITOR',
      allowNo: true
    } )
  };

  /**
   * Once monitoring begins the workflow itself started fine, so `catch` must stop
   * blaming the workflow *name* for a 404 and use the monitor's own error mapping.
   */
  private monitoring = false;

  async run(): Promise<PostWorkflowStart200> {
    const { args, flags } = await this.parse( WorkflowStart );

    // Belt-and-braces alongside `exclusive: [ 'json' ]`: the built-in `--json`
    // flag is injected by `enableJsonFlag` rather than declared above, and
    // `CONTENT_TYPE=json` turns it on without it appearing on argv at all — in
    // which case oclif's relationship check has nothing to reject. Streaming
    // under `--json` is worse than useless: `Command.log()` is a no-op while
    // json is enabled, so every update would be swallowed and the command would
    // simply hang until the workflow ended.
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
    const output = [
      'Workflow started successfully',
      '',
      `Workflow ID: ${result.workflowId || 'unknown'}`,
      // The follow-up hints tell the user how to do what --monitor is already
      // doing, so they'd only be noise above a live stream.
      ...flags.monitor ? [] : [
        '',
        `Use "workflow status ${result.workflowId || '<workflow-id>'}" to check the workflow status`,
        `Use "workflow result ${result.workflowId || '<workflow-id>'}" to get the workflow result when complete`
      ]
    ].join( '\n' );

    this.log( `\n${output}` );

    if ( !flags.monitor ) {
      return result;
    }

    if ( !result.workflowId ) {
      this.error( 'Cannot monitor: the API did not return a workflow ID.', { exit: 1 } );
    }

    this.log( '' );
    this.monitoring = true;
    await streamWorkflowUpdates( {
      workflowId: result.workflowId,
      // Pin to the run just started rather than letting the monitor resolve
      // "latest run" — with a retry or a rapid re-start those can differ.
      runId: result.runId ?? undefined,
      includePayloads: flags['include-payloads'] ?? false,
      interval: flags.interval ?? DEFAULT_INTERVAL_MS,
      // Always text: --monitor and --json are mutually exclusive, so json mode
      // is unreachable here. `workflow monitor --format json` is the NDJSON path.
      json: false,
      color: flags.color ?? true
    }, {
      log: message => this.log( message ),
      warn: message => {
        this.warn( message );
      },
      error: message => this.error( message, { exit: 1 } )
    } );

    return result;
  }

  async catch( error: Error ): Promise<void> {
    const overrides = this.monitoring ?
      monitorErrorOverrides( error ) :
      { 404: 'Workflow not found. Check the workflow name.' };
    return handleApiError( error, ( ...args ) => this.error( ...args ), overrides );
  }
}
