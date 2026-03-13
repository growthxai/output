import { Args, Command, Flags } from '@oclif/core';
import { postWorkflowIdTerminate } from '#api/generated/api.js';
import { handleApiError } from '#utils/error_handler.js';

export default class WorkflowTerminate extends Command {
  static override description = 'Terminate a workflow execution (force stop)';

  static override examples = [
    '<%= config.bin %> <%= command.id %> wf-12345',
    '<%= config.bin %> <%= command.id %> wf-12345 --reason "Cleaning up old workflows"'
  ];

  static override args = {
    workflowId: Args.string( {
      description: 'The workflow ID to terminate',
      required: true
    } )
  };

  static override flags = {
    reason: Flags.string( {
      char: 'r',
      description: 'Reason for termination'
    } )
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse( WorkflowTerminate );

    this.log( `Terminating workflow: ${args.workflowId}...` );

    await postWorkflowIdTerminate( args.workflowId, { reason: flags.reason } );

    const output = [
      'Workflow terminated successfully',
      '',
      `Workflow ID: ${args.workflowId}`,
      flags.reason ? `Reason: ${flags.reason}` : ''
    ].filter( Boolean ).join( '\n' );

    this.log( `\n${output}` );
  }

  async catch( error: Error ): Promise<void> {
    return handleApiError( error, ( ...args ) => this.error( ...args ), {
      404: 'Workflow not found. Check the workflow ID.'
    } );
  }
}
