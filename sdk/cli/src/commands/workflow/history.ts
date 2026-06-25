import { Args, Command, Flags } from '@oclif/core';
import { fetchWorkflowHistory } from '#services/workflow_history.js';
import buildSpanLabels from '#utils/span_labels.js';
import renderWaterfall, { formatDurationLabel } from '#utils/waterfall.js';
import { OUTPUT_FORMAT } from '../../utils/constants.js';
import { handleApiError } from '#utils/error_handler.js';

const DEFAULT_WIDTH = 80;

export default class WorkflowHistory extends Command {
  static override description = 'Show a workflow run\'s step timeline as a waterfall (durations and start times)';

  static override examples = [
    '<%= config.bin %> <%= command.id %> wf-12345',
    '<%= config.bin %> <%= command.id %> wf-12345 --run-id 2fe0b36b-...',
    '<%= config.bin %> <%= command.id %> wf-12345 --format json',
    '<%= config.bin %> <%= command.id %> wf-12345 --raw --include-payloads'
  ];

  static override args = {
    workflowId: Args.string( {
      description: 'The workflow ID to show history for',
      required: true
    } )
  };

  static override flags = {
    'run-id': Flags.string( {
      char: 'r',
      description: 'Show a specific run (defaults to the latest run)'
    } ),
    format: Flags.string( {
      char: 'f',
      description: 'Output format',
      options: [ OUTPUT_FORMAT.TEXT, OUTPUT_FORMAT.JSON ],
      default: OUTPUT_FORMAT.TEXT
    } ),
    raw: Flags.boolean( {
      description: 'Print the history endpoint\'s raw response (workflow + events)',
      default: false
    } ),
    'include-payloads': Flags.boolean( {
      description: 'Include decoded step input/output payloads',
      default: false
    } ),
    width: Flags.integer( {
      description: 'Override the detected terminal width'
    } ),
    color: Flags.boolean( {
      description: 'Colorize the waterfall (use --no-color to disable)',
      default: true,
      allowNo: true
    } )
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse( WorkflowHistory );

    const result = await fetchWorkflowHistory( {
      workflowId: args.workflowId,
      runId: flags['run-id'],
      includePayloads: flags['include-payloads']
    } );

    if ( flags.raw ) {
      this.log( JSON.stringify( {
        workflow: result.workflow,
        runId: result.runId,
        events: result.events
      }, null, 2 ) );
      return;
    }

    if ( flags.format === OUTPUT_FORMAT.JSON ) {
      this.log( JSON.stringify( {
        workflow: result.workflow,
        runId: result.runId,
        totalDurationMs: result.totalDurationMs,
        spans: result.spans
      }, null, 2 ) );
      return;
    }

    const labels = buildSpanLabels( result.spans );
    const width = flags.width ?? process.stdout.columns ?? DEFAULT_WIDTH;
    const color = flags.color && !process.env.NO_COLOR &&
      ( !!process.env.FORCE_COLOR || process.stdout.isTTY === true );

    this.log( renderWaterfall( result.spans, result.totalDurationMs, {
      width,
      color,
      labels,
      header: this.buildHeader( args.workflowId, result.runId, result.workflow?.status, result.totalDurationMs )
    } ) );

    // Failure reasons live in the payloads the server strips by default, so a
    // failed run shows red bars but no messages until payloads are requested.
    if ( !flags['include-payloads'] && result.spans.some( span => span.status === 'failed' ) ) {
      this.log( '\nSome steps failed — re-run with --include-payloads to see their error messages.' );
    }
  }

  private buildHeader( workflowId: string, runId: string | null, status: string | undefined, totalDurationMs: number ): string {
    const shortRun = runId ? runId.slice( 0, 8 ) : 'unknown';
    return `${workflowId} · run ${shortRun} · ${status ?? 'unknown'} · ${formatDurationLabel( totalDurationMs )}`;
  }

  async catch( error: Error ): Promise<void> {
    return handleApiError( error, ( ...args ) => this.error( ...args ), {
      404: 'Workflow not found. Check the workflow ID.'
    } );
  }
}
