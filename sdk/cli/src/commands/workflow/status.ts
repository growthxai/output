import { Args, Command, Flags } from '@oclif/core';
import { getWorkflowIdStatus, GetWorkflowIdStatus200 } from '#api/generated/api.js';
import { OUTPUT_FORMAT, OutputFormat } from '#utils/constants.js';
import { formatOutput } from '#utils/output_formatter.js';
import { handleApiError } from '#utils/error_handler.js';

export default class WorkflowStatus extends Command {
  static override description = 'Get workflow execution status';

  static override examples = [
    '<%= config.bin %> <%= command.id %> wf-12345',
    '<%= config.bin %> <%= command.id %> wf-12345 --format json'
  ];

  static override args = {
    workflowId: Args.string( {
      description: 'The workflow ID to check status for',
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
    const { args, flags } = await this.parse( WorkflowStatus );

    this.log( `Fetching status for workflow: ${args.workflowId}...` );

    const response = await getWorkflowIdStatus( args.workflowId );

    if ( !response || !response.data ) {
      this.error( 'API returned invalid response', { exit: 1 } );
    }

    const data = response.data as GetWorkflowIdStatus200;
    const output = formatOutput(
      data,
      flags.format as OutputFormat,
      ( result: GetWorkflowIdStatus200 ) => {
        const lines = [
          `Workflow ID: ${result.workflowId || 'unknown'}`,
          `Status: ${result.status || 'unknown'}`,
          ''
        ];

        if ( result.startedAt ) {
          const startDate = new Date( result.startedAt );
          lines.push( `Started At: ${startDate.toISOString()}` );
        }

        if ( result.completedAt ) {
          const completedDate = new Date( result.completedAt );
          lines.push( `Completed At: ${completedDate.toISOString()}` );
        }

        return lines.join( '\n' );
      }
    );

    this.log( `\n${output}` );
  }

  async catch( error: Error ): Promise<void> {
    return handleApiError( error, ( ...args ) => this.error( ...args ), {
      404: 'Workflow not found. Check the workflow ID.'
    } );
  }
}
