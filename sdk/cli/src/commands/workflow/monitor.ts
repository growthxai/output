import { Args, Command, Flags } from '@oclif/core';
import { fetchWorkflowHistory } from '#services/workflow_history.js';
import type { SpanStatus } from '#services/workflow_history/correlator.js';
import type { WorkflowResultResponseStatus } from '#api/generated/api.js';
import buildSpanLabels from '#utils/span_labels.js';
import { formatDurationLabel } from '#utils/waterfall.js';
import { diffSpanUpdates, formatSpanUpdate } from '#utils/monitor_log.js';
import { ERROR_STATUSES } from '#utils/format_workflow_result.js';
import { handleApiError } from '#utils/error_handler.js';
import { sleep } from '#utils/sleep.js';
import { shouldColorize } from '#utils/color.js';

const DEFAULT_INTERVAL_MS = 2500;
const MAX_CONSECUTIVE_ERRORS = 5;
// "Terminal" is every error status plus the one success status — derived so
// the two sets can't silently drift apart as error statuses evolve.
const TERMINAL_STATUSES: ReadonlySet<string> = new Set( [ 'completed', ...( Array.from( ERROR_STATUSES ) as string[] ) ] );
const OUTPUT_FORMAT = { JSON: 'json', TEXT: 'text' } as const;
const SIGINT_EXIT_CODE = 130;

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
      description: 'Poll interval in milliseconds',
      default: DEFAULT_INTERVAL_MS
    } ),
    color: Flags.boolean( {
      description: 'Colorize status output (use --no-color to disable)',
      default: true,
      allowNo: true
    } )
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse( WorkflowMonitor );
    const color = shouldColorize( flags.color );
    const json = flags.format === OUTPUT_FORMAT.JSON;

    // Threaded via mutable properties (not `let` reassignment) so state
    // persists across polls without local variable reassignment.
    const state = {
      runId: flags['run-id'],
      consecutiveErrors: 0,
      firstTick: true
    };
    const seen = new Map<string, SpanStatus>();

    // One emit point for both output formats: json mode wraps `fields` (plus
    // the ambient workflow/run id) as a line of NDJSON, text mode prints `text`.
    const emit = ( fields: Record<string, unknown>, text: string ): void => {
      this.log( json ?
        JSON.stringify( { workflowId: args.workflowId, runId: state.runId, ...fields } ) :
        text );
    };

    this.log( `Monitoring ${args.workflowId}${state.runId ? ` (run ${state.runId})` : ''}... (Ctrl+C to detach)` );

    const sigintHandler = (): void => {
      this.log( '\nDetached (the workflow keeps running).' );
      process.exit( SIGINT_EXIT_CODE );
    };
    process.on( 'SIGINT', sigintHandler );

    try {
      for ( ; ; ) {
        const result = await this.poll( args.workflowId, state.runId, flags, state.firstTick, state.consecutiveErrors );
        if ( result === null ) {
          state.consecutiveErrors += 1;
          await sleep( flags.interval );
          continue;
        }
        state.consecutiveErrors = 0;
        state.firstTick = false;

        state.runId = result.runId ?? state.runId;
        const labels = buildSpanLabels( result.spans );
        for ( const update of diffSpanUpdates( result.spans, labels, seen ) ) {
          emit( { span: update.span }, formatSpanUpdate( update, color ) );
        }

        const status = result.workflow?.status;

        if ( status === 'continued_as_new' ) {
          if ( !result.continuedAsNewRunId ) {
            this.error( 'Workflow continued as a new run, but the new run ID could not be determined.', { exit: 1 } );
          }
          emit(
            { continuedAsNewRunId: result.continuedAsNewRunId },
            `↻ continued as new run ${result.continuedAsNewRunId}`
          );
          state.runId = result.continuedAsNewRunId;
          seen.clear();
          await sleep( flags.interval );
          continue;
        }

        if ( status && TERMINAL_STATUSES.has( status ) ) {
          const summary = `${status === 'completed' ? '✓' : '✗'} workflow ${status} · ${formatDurationLabel( result.totalDurationMs )}`;
          emit( { status }, summary );
          if ( ERROR_STATUSES.has( status as WorkflowResultResponseStatus ) ) {
            process.exitCode = 1;
          }
          return;
        }

        await sleep( flags.interval );
      }
    } finally {
      process.removeListener( 'SIGINT', sigintHandler );
    }
  }

  /**
   * Wraps a single poll: a failure on the very first tick propagates (there's
   * nothing to fall back on), but a blip after we've already been monitoring
   * successfully just returns `null` so the loop can retry — matching the dev
   * TUI's `useStepGraph` behavior of keeping the last good state on a poll
   * hiccup. `MAX_CONSECUTIVE_ERRORS` bounds how long we'll retry silently.
   */
  private async poll(
    workflowId: string,
    runId: string | undefined,
    flags: { 'include-payloads': boolean },
    firstTick: boolean,
    consecutiveErrors: number
  ): Promise<Awaited<ReturnType<typeof fetchWorkflowHistory>> | null> {
    try {
      return await fetchWorkflowHistory( { workflowId, runId, includePayloads: flags['include-payloads'] } );
    } catch ( error ) {
      if ( firstTick || consecutiveErrors + 1 >= MAX_CONSECUTIVE_ERRORS ) {
        throw error;
      }
      this.warn( `Poll failed (${consecutiveErrors + 1}/${MAX_CONSECUTIVE_ERRORS}), retrying: ${( error as Error ).message}` );
      return null;
    }
  }

  async catch( error: Error ): Promise<void> {
    return handleApiError( error, ( ...args ) => this.error( ...args ), {
      404: 'Workflow not found. Check the workflow ID.'
    } );
  }
}
