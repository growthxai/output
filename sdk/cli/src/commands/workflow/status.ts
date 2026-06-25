import { Args, Command } from '@oclif/core';
import { getWorkflowIdStatus, WorkflowStatusResponse } from '#api/generated/api.js';
import { handleApiError } from '#utils/error_handler.js';
import { normalizeWorkflowStatus } from '#utils/normalize_workflow_status.js';

function formatStatusText( result: WorkflowStatusResponse ): string {
  const lines = [
    `Workflow ID: ${result.workflowId || 'unknown'}`,
    `Status: ${result.status || 'unknown'}`,
    ''
  ];

  if ( result.startedAt ) {
    lines.push( `Started At: ${new Date( result.startedAt ).toISOString()}` );
  }

  if ( result.completedAt ) {
    lines.push( `Completed At: ${new Date( result.completedAt ).toISOString()}` );
  }

  return lines.join( '\n' );
}

export default class WorkflowStatus extends Command {
  static override description = 'Get workflow execution status';

  static override enableJsonFlag = true;

  static override examples = [
    '<%= config.bin %> <%= command.id %> wf-12345',
    '<%= config.bin %> <%= command.id %> wf-12345 --json'
  ];

  static override args = {
    workflowId: Args.string( {
      description: 'The workflow ID to check status for',
      required: true
    } )
  };

  async run(): Promise<WorkflowStatusResponse> {
    const { args } = await this.parse( WorkflowStatus );

    this.log( `Fetching status for workflow: ${args.workflowId}...` );

    const response = await getWorkflowIdStatus( args.workflowId );

    if ( !response || !response.data ) {
      this.error( 'API returned invalid response', { exit: 1 } );
    }

    const rawData = response.data as WorkflowStatusResponse;
    const data = {
      ...rawData,
      status: normalizeWorkflowStatus( rawData.status )
    } as WorkflowStatusResponse;

    this.log( `\n${formatStatusText( data )}` );

    return data;
  }

  async catch( error: Error ): Promise<void> {
    return handleApiError( error, ( ...args ) => this.error( ...args ), {
      404: 'Workflow not found. Check the workflow ID.'
    } );
  }
}
