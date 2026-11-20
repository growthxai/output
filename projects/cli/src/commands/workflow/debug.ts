import { Args, Command, Flags } from '@oclif/core';
import { CLIError } from '@oclif/core/errors';
import { collectWorkflowDebug } from '#services/workflow_debug.js';
import { createTemporalClient, formatTemporalError } from '#services/temporal_client.js';
import { temporalFlags } from '#utils/temporal_flags.js';
import { createErrorFn, handleCommandError } from '#utils/error_handler.js';

export default class WorkflowDebug extends Command {
  static override description = 'Read a workflow run and its child workflows from Temporal as JSON, one entry per workflow, for debugging';

  static override examples = [
    '<%= config.bin %> <%= command.id %> wf-12345',
    '<%= config.bin %> <%= command.id %> wf-12345 --run-id 11111111-2222-4333-8444-555555555555',
    '<%= config.bin %> <%= command.id %> wf-12345 --profile prod',
    '<%= config.bin %> <%= command.id %> wf-12345 --address temporal.internal:7233 --namespace staging'
  ];

  static override args = {
    workflowId: Args.string( {
      description: 'The workflow ID to debug',
      required: true
    } )
  };

  static override flags = {
    'run-id': Flags.string( {
      char: 'r',
      description: 'Run to start from (defaults to the latest run); runs that continue from it are read too'
    } ),
    // The output is always JSON; kept so scripts that pass --json keep working
    json: Flags.boolean( {
      hidden: true,
      description: 'Accepted and ignored: the output is always JSON'
    } ),
    ...temporalFlags
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse( WorkflowDebug );
    const { client, address, namespace, close } = await createTemporalClient( flags );

    try {
      const result = await collectWorkflowDebug( client, { address, namespace, workflowId: args.workflowId, runId: flags['run-id'] } );
      this.log( JSON.stringify( result ) );
    } finally {
      await close();
    }
  }

  async catch( error: Error ): Promise<void> {
    const errorFn = createErrorFn( this );
    if ( error instanceof CLIError ) {
      return handleCommandError( error, errorFn );
    }
    return errorFn( formatTemporalError( error ), { exit: 1 } );
  }
}
