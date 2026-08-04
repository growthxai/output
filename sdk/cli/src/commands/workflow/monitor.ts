import { Args, Command, Flags } from '@oclif/core';
import {
  DEFAULT_INTERVAL_MS, monitorErrorOverrides, streamWorkflowUpdates
} from '#services/monitor_stream.js';
import { handleApiError } from '#utils/error_handler.js';

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
    'include-payloads': Flags.boolean( {
      description: 'Include decoded step input/output payloads',
      default: false
    } ),
    interval: Flags.integer( {
      description: 'Poll interval in milliseconds. Once a resumed poll is long-polling ' +
        'server-side for new events, this also bounds how long that block may last (capped ' +
        'at the server\'s configured max), so an idle workflow\'s update cadence is roughly ' +
        'twice this value (the long-poll bound, then this sleep) rather than a much longer, ' +
        'separate server default.',
      default: DEFAULT_INTERVAL_MS,
      min: 1
    } ),
    color: Flags.boolean( {
      description: 'Colorize status output (use --no-color to disable)',
      default: true,
      allowNo: true
    } )
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse( WorkflowMonitor );

    // Late-bound arrow functions, not `this.log.bind( this )`: oclif (and the
    // unit tests) replace these as own properties on the instance, so they must
    // resolve at call time rather than being captured here.
    await streamWorkflowUpdates( {
      workflowId: args.workflowId,
      runId: flags['run-id'],
      includePayloads: flags['include-payloads'],
      interval: flags.interval,
      json: flags.format === OUTPUT_FORMAT.JSON,
      color: flags.color
    }, {
      log: message => this.log( message ),
      warn: message => {
        this.warn( message );
      },
      error: message => this.error( message, { exit: 1 } )
    } );
  }

  async catch( error: Error ): Promise<void> {
    return handleApiError( error, ( ...args ) => this.error( ...args ), monitorErrorOverrides( error ) );
  }
}
