import { Args, Command, Flags } from '@oclif/core';
import { postWorkflowIdReset, type ResetWorkflowResponse } from '#api/generated/api.js';
import { handleApiError } from '#utils/error_handler.js';

export default class WorkflowReset extends Command {
  static override description = 'Reset a workflow to re-run from after a specific step';

  static override examples = [
    '<%= config.bin %> <%= command.id %> wf-12345 --step generateBlogPost',
    '<%= config.bin %> <%= command.id %> wf-12345 --step consolidateCompetitors --reason "Retry with updated prompt"'
  ];

  static override args = {
    workflowId: Args.string( {
      description: 'The workflow ID to reset',
      required: true
    } )
  };

  static override flags = {
    step: Flags.string( {
      char: 's',
      description: 'The step name to reset after',
      required: true
    } ),
    reason: Flags.string( {
      char: 'r',
      description: 'Reason for the reset'
    } )
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse( WorkflowReset );

    this.log( `Resetting workflow: ${args.workflowId} to after step: ${flags.step}...` );

    const response = await postWorkflowIdReset( args.workflowId, { stepName: flags.step, reason: flags.reason } );

    if ( !response || !response.data ) {
      this.error( 'API returned invalid response', { exit: 1 } );
    }

    const data = response.data as ResetWorkflowResponse;

    const output = [
      'Workflow reset successfully',
      '',
      `Workflow ID: ${args.workflowId}`,
      `New Run ID: ${data.runId}`,
      `Reset after step: ${flags.step}`,
      flags.reason ? `Reason: ${flags.reason}` : ''
    ].filter( Boolean ).join( '\n' );

    this.log( `\n${output}` );
  }

  async catch( error: Error ): Promise<void> {
    return handleApiError( error, ( ...args ) => this.error( ...args ), {
      404: 'Workflow or step not found. Check the workflow ID and step name.',
      409: 'Step has not completed yet. Cannot reset to an incomplete step.'
    } );
  }
}
