import { Args, Command, Flags } from '@oclif/core';
import { postWorkflowStart, type PostWorkflowStart200 } from '#api/generated/api.js';
import { handleApiError } from '#utils/error_handler.js';
import { resolveInput } from '#utils/resolve_input.js';

export default class WorkflowStart extends Command {
  static override description = 'Start a workflow asynchronously without waiting for completion';

  static override examples = [
    '<%= config.bin %> <%= command.id %> simple basic_input',
    '<%= config.bin %> <%= command.id %> simple --input \'{"values":[1,2,3]}\'',
    '<%= config.bin %> <%= command.id %> simple --input input.json',
    '<%= config.bin %> <%= command.id %> simple --input \'{"key":"value"}\' --task-queue my-queue'
  ];

  static override args = {
    workflowName: Args.string( {
      description: 'Name of the workflow to start',
      required: true
    } ),
    scenario: Args.string( {
      description: 'Scenario name (resolved from the workflow\'s scenarios/ directory)',
      required: false
    } )
  };

  static override flags = {
    input: Flags.string( {
      char: 'i',
      description: 'Workflow input as JSON string or file path (overrides scenario)',
      required: false
    } ),
    'task-queue': Flags.string( {
      char: 'q',
      description: 'Task queue name for workflow execution'
    } )
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse( WorkflowStart );

    const input = await resolveInput( args.workflowName, args.scenario, flags.input, 'start' );

    this.log( `Starting workflow: ${args.workflowName}...` );

    const response = await postWorkflowStart( {
      workflowName: args.workflowName,
      input,
      taskQueue: flags['task-queue']
    } );

    if ( !response || !response.data ) {
      this.error( 'API returned invalid response', { exit: 1 } );
    }

    const result = response.data as PostWorkflowStart200;
    const output = [
      'Workflow started successfully',
      '',
      `Workflow ID: ${result.workflowId || 'unknown'}`,
      '',
      `Use "workflow status ${result.workflowId || '<workflow-id>'}" to check the workflow status`,
      `Use "workflow result ${result.workflowId || '<workflow-id>'}" to get the workflow result when complete`
    ].join( '\n' );

    this.log( `\n${output}` );
  }

  async catch( error: Error ): Promise<void> {
    return handleApiError( error, ( ...args ) => this.error( ...args ), {
      404: 'Workflow not found. Check the workflow name.'
    } );
  }
}
