import { Args, Command, Flags } from '@oclif/core';
import { postWorkflowRun, type PostWorkflowRun200 } from '#api/generated/api.js';
import { OUTPUT_FORMAT, OutputFormat } from '#utils/constants.js';
import { formatOutput } from '#utils/output_formatter.js';
import { formatWorkflowResult, ERROR_STATUSES } from '#utils/format_workflow_result.js';
import { handleApiError } from '#utils/error_handler.js';
import { resolveInput } from '#utils/resolve_input.js';
import { getRetryDelayFromResponse } from '#utils/header_utils.js';
import { sleep } from '#utils/sleep.js';
import { HttpError } from '#api/http_client.js';

const MAX_RETRIES = 3;

type ExecuteWorkflowParams = {
  body: Parameters<typeof postWorkflowRun>[0];
  options: Parameters<typeof postWorkflowRun>[1];
  log: ( msg: string ) => void;
  attempt?: number;
};

async function executeWorkflow( args: ExecuteWorkflowParams ): Promise<Awaited<ReturnType<typeof postWorkflowRun>>> {
  const { body, options, log, attempt = 0 } = args;
  try {
    return await postWorkflowRun( body, options );
  } catch ( error ) {
    if ( !( error instanceof HttpError ) || attempt >= MAX_RETRIES ) {
      throw error;
    }

    const { response } = error as HttpError;

    const delay = getRetryDelayFromResponse( response );
    if ( delay === null ) {
      throw error;
    }

    log( `Server returned ${response.status} with header "Retry-After". Retrying in ${delay / 1000}s...` );
    await sleep( delay );
    return executeWorkflow( { body, options, log, attempt: attempt + 1 } );
  }
}

export default class WorkflowRun extends Command {
  static override description = 'Execute a workflow synchronously and wait for completion';

  static override examples = [
    '<%= config.bin %> <%= command.id %> simple basic_input',
    '<%= config.bin %> <%= command.id %> simple my_scenario --format json',
    '<%= config.bin %> <%= command.id %> simple --input \'{"values":[1,2,3]}\'',
    '<%= config.bin %> <%= command.id %> simple --input input.json',
    '<%= config.bin %> <%= command.id %> simple --input \'{"key":"value"}\' --task-queue my-queue'
  ];

  static override args = {
    workflowName: Args.string( {
      description: 'Name of the workflow to execute',
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
    } ),
    format: Flags.string( {
      char: 'f',
      description: 'Output format',
      options: [ OUTPUT_FORMAT.JSON, OUTPUT_FORMAT.TEXT ],
      default: OUTPUT_FORMAT.TEXT
    } )
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse( WorkflowRun );

    const input = await resolveInput( args.workflowName, args.scenario, flags.input, 'run' );

    this.log( `Executing workflow: ${args.workflowName}...` );

    const response = await executeWorkflow( {
      body: {
        workflowName: args.workflowName,
        input,
        taskQueue: flags['task-queue']
      },
      options: { config: { timeout: 600000 } as const },
      log: msg => this.log( msg )
    } );

    if ( !response || !response.data ) {
      this.error( 'API returned invalid response', { exit: 1 } );
    }

    const data = response.data as PostWorkflowRun200;
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
      404: 'Workflow not found. Check the workflow name.',
      500: 'Workflow execution failed.',
      503: 'Workflow service temporarily unavailable.'
    } );
  }
}
