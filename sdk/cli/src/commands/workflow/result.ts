import { Args, Command, Flags } from '@oclif/core';
import { getWorkflowIdResult, type WorkflowResultResponse } from '#api/generated/api.js';
import { OUTPUT_FORMAT, OutputFormat } from '#utils/constants.js';
import { formatOutput } from '#utils/output_formatter.js';
import { formatWorkflowResult, ERROR_STATUSES } from '#utils/format_workflow_result.js';
import { handleApiError } from '#utils/error_handler.js';

export default class WorkflowResult extends Command {
  static override description = 'Get workflow execution result';

  static override examples = [
    '<%= config.bin %> <%= command.id %> wf-12345',
    '<%= config.bin %> <%= command.id %> wf-12345 --format json'
  ];

  static override args = {
    workflowId: Args.string( {
      description: 'The workflow ID to get result for',
      required: true
    } )
  };

  static override flags = {
    format: Flags.string( {
      char: 'f',
      description: 'Output format',
      options: [ OUTPUT_FORMAT.JSON, OUTPUT_FORMAT.TEXT ],
      default: OUTPUT_FORMAT.TEXT
    } )
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse( WorkflowResult );

    this.log( `Fetching result for workflow: ${args.workflowId}...` );

    const response = await getWorkflowIdResult( args.workflowId );

    if ( !response || !response.data ) {
      this.error( 'API returned invalid response', { exit: 1 } );
    }

    const data = response.data as WorkflowResultResponse;
    const output = formatOutput(
      data,
      flags.format as OutputFormat,
      formatWorkflowResult
    );

    this.log( `\n${output}` );

    if ( ERROR_STATUSES.has( data.status ) ) {
      process.exitCode = 1;
    }
  }

  async catch( error: Error ): Promise<void> {
    return handleApiError( error, ( ...args ) => this.error( ...args ), {
      404: 'Workflow not found. Check the workflow ID.'
    } );
  }
}
