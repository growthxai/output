import { Args, Command } from '@oclif/core';
import { patchWorkflowIdStop } from '#api/generated/api.js';
import { handleApiError } from '#utils/error_handler.js';

export default class WorkflowStop extends Command {
  static override description = 'Stop a workflow execution';

  static override examples = [
    '<%= config.bin %> <%= command.id %> wf-12345'
  ];

  static override args = {
    workflowId: Args.string( {
      description: 'The workflow ID to stop',
      required: true
    } )
  };

  async run(): Promise<void> {
    const { args } = await this.parse( WorkflowStop );

    this.log( `Stopping workflow: ${args.workflowId}...` );

    await patchWorkflowIdStop( args.workflowId );

    const output = [
      'Workflow stopped successfully',
      '',
      `Workflow ID: ${args.workflowId}`
    ].join( '\n' );

    this.log( `\n${output}` );
  }

  async catch( error: Error ): Promise<void> {
    return handleApiError( error, ( ...args ) => this.error( ...args ), {
      404: 'Workflow not found. Check the workflow ID.'
    } );
  }
}
