import { Args, Command, Flags } from '@oclif/core';
import { readFile } from 'node:fs/promises';

import { calculateCost, loadPricingConfig } from '#services/cost_calculator.js';
import { getTrace } from '#services/trace_reader.js';
import type { TraceNode } from '#types/cost.js';
import { OUTPUT_FORMAT, type OutputFormat } from '#utils/constants.js';
import { formatCostReport } from '#utils/cost_formatter.js';
import { getErrorCode } from '#utils/error_utils.js';
import { handleApiError } from '#utils/error_handler.js';
import { formatOutput } from '#utils/output_formatter.js';

export default class WorkflowCost extends Command {
  static override description = 'Calculate the cost of a workflow execution';

  static override examples = [
    '<%= config.bin %> <%= command.id %> my_workflow',
    '<%= config.bin %> <%= command.id %> my_workflow --verbose',
    '<%= config.bin %> <%= command.id %> my_workflow path/to/trace.json',
    '<%= config.bin %> <%= command.id %> my_workflow --format json'
  ];

  static override args = {
    workflowId: Args.string( {
      description: 'Workflow ID to calculate cost for',
      required: true
    } ),
    tracePath: Args.string( {
      description: 'Path to a trace JSON file (optional, fetches latest trace if omitted)',
      required: false
    } )
  };

  static override flags = {
    format: Flags.string( {
      char: 'f',
      description: 'Output format',
      options: [ OUTPUT_FORMAT.JSON, OUTPUT_FORMAT.TEXT ],
      default: OUTPUT_FORMAT.TEXT
    } ),
    verbose: Flags.boolean( {
      description: 'Show detailed per-call breakdown',
      default: false
    } )
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse( WorkflowCost );

    const { traceData, traceFile } = args.tracePath ?
      await this.loadLocalTrace( args.tracePath ) :
      { traceData: ( await getTrace( args.workflowId ) ).data as unknown, traceFile: undefined };

    const config = loadPricingConfig();
    const traceNode = traceData as TraceNode;
    const report = calculateCost( traceNode, config, traceFile );

    const formatted = formatOutput(
      report,
      flags.format as OutputFormat,
      r => formatCostReport( r, { verbose: flags.verbose } )
    );

    this.log( formatted );
  }

  private async loadLocalTrace( tracePath: string ): Promise<{ traceData: unknown; traceFile: string }> {
    try {
      const content = await readFile( tracePath, 'utf-8' );
      return { traceData: JSON.parse( content ), traceFile: tracePath };
    } catch ( error ) {
      if ( getErrorCode( error ) === 'ENOENT' ) {
        this.error( `Trace file not found: ${tracePath}`, { exit: 1 } );
      }
      if ( error instanceof SyntaxError ) {
        this.error( `Invalid JSON in trace file: ${tracePath}`, { exit: 1 } );
      }
      throw error;
    }
  }

  async catch( error: Error ): Promise<void> {
    return handleApiError( error, ( ...args ) => this.error( ...args ), {
      404: 'Workflow not found. Check the workflow ID and try again.'
    } );
  }
}
