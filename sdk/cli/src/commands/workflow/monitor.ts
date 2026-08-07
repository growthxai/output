import { Args, Command, Flags } from '@oclif/core';
import { commandStreamIo, monitorErrorOverrides, streamWorkflowUpdates } from '#services/monitor_stream.js';
import { handleCommandError } from '#utils/error_handler.js';
import { monitorStreamFlags } from '#utils/monitor_flags.js';

const OUTPUT_FORMAT = { JSON: 'json', TEXT: 'text' } as const;

/**
 * Unlike `run`/`status`/`result` (migrated to oclif's native `--json` in
 * OUT-419, #281), this command deliberately keeps a custom `--format json`
 * instead of `enableJsonFlag`. Native `--json` suppresses all `this.log()`
 * calls and prints exactly one JSON object — the command's return value —
 * after `run()` resolves. `monitor` has no single "return value": it emits a
 * live stream of discrete events (span status changes, a continue-as-new
 * notice, a final summary) while the workflow is still in progress, and
 * `--format json` prints each as its own NDJSON line as it happens. That's
 * the point — a caller (often another automated/agent process, not a human)
 * can tail and parse the stream incrementally, which native `--json`'s
 * "one object at the end" model can't do. See docs/guides/packages/cli.mdx
 * ("output workflow monitor") for the same rationale written up for users.
 *
 * The polling loop itself lives in `#services/monitor_stream.js` so
 * `workflow start --monitor` (OUT-537) streams through the same code path.
 */
export default class WorkflowMonitor extends Command {
  static override description = 'Attach to a workflow run and stream status updates until it ends';

  static override examples = [
    '<%= config.bin %> <%= command.id %> wf-12345',
    '<%= config.bin %> <%= command.id %> wf-12345 --run-id 2fe0b36b-...',
    '<%= config.bin %> <%= command.id %> wf-12345 --format json'
  ];

  static override args = {
    workflowId: Args.string( {
      description: 'The workflow ID to monitor',
      required: true
    } )
  };

  static override flags = {
    'run-id': Flags.string( {
      char: 'r',
      description: 'Monitor a specific run (defaults to the latest run; continue-as-new chains are followed regardless)'
    } ),
    format: Flags.string( {
      char: 'f',
      description: 'Output format',
      options: [ OUTPUT_FORMAT.TEXT, OUTPUT_FORMAT.JSON ],
      default: OUTPUT_FORMAT.TEXT
    } ),
    ...monitorStreamFlags()
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse( WorkflowMonitor );

    await streamWorkflowUpdates( {
      workflowId: args.workflowId,
      runId: flags['run-id'],
      includePayloads: flags['include-payloads'],
      interval: flags.interval,
      json: flags.format === OUTPUT_FORMAT.JSON,
      color: flags.color
    }, commandStreamIo( this ) );
  }

  async catch( error: Error ): Promise<void> {
    return handleCommandError( error, ( ...args ) => this.error( ...args ), {
      ...monitorErrorOverrides( error ),
      // Owned by this command rather than the shared overrides: here the id is the
      // argument the user typed, so pointing at it is actionable advice.
      404: 'Workflow not found. Check the workflow ID.'
    } );
  }
}
