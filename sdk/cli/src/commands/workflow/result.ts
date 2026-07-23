import { Args, Command } from '@oclif/core';
import { getWorkflowIdResult, type WorkflowResultResponse } from '#api/generated/api.js';
import { formatWorkflowResult, isErrorWorkflowStatus } from '#utils/format_workflow_result.js';
import { handleApiError } from '#utils/error_handler.js';

export default class WorkflowResult extends Command {
  static override description = 'Get workflow execution result';

  static override enableJsonFlag = true;

  static override examples = [
    '<%= config.bin %> <%= command.id %> wf-12345',
    '<%= config.bin %> <%= command.id %> wf-12345 --json'
  ];

  static override args = {
    workflowId: Args.string( {
      description: 'The workflow ID to get result for',
      required: true
    } )
  };

  async run(): Promise<WorkflowResultResponse> {
    const { args } = await this.parse( WorkflowResult );

    this.log( `Fetching result for workflow: ${args.workflowId}...` );

    const response = await getWorkflowIdResult( args.workflowId );

    if ( !response || !response.data ) {
      this.error( 'API returned invalid response', { exit: 1 } );
    }

    const data = response.data as WorkflowResultResponse;

    this.log( `\n${formatWorkflowResult( data )}` );

    if ( isErrorWorkflowStatus( data.status ) ) {
      process.exitCode = 1;
    }

    return data;
  }

  async catch( error: Error ): Promise<void> {
    return handleApiError( error, ( ...args ) => this.error( ...args ), {
      404: 'Workflow not found. Check the workflow ID.'
    } );
  }
}
