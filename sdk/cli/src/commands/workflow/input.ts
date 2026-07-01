import { Args, Command, Flags } from '@oclif/core';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  getWorkflowIdInput,
  getWorkflowIdRunsRidInput,
  type WorkflowInputResponse
} from '#api/generated/api.js';
import { handleApiError } from '#utils/error_handler.js';

export default class WorkflowInput extends Command {
  static override description = 'Get the original input a workflow run was started with';

  static override enableJsonFlag = true;

  static override examples = [
    '<%= config.bin %> <%= command.id %> wf-12345',
    '<%= config.bin %> <%= command.id %> wf-12345 --run-id 11111111-2222-4333-8444-555555555555',
    '<%= config.bin %> <%= command.id %> wf-12345 -o w_input.json',
    '<%= config.bin %> <%= command.id %> wf-12345 --output-file w_input.json --force'
  ];

  static override args = {
    workflowId: Args.string( {
      description: 'The workflow ID to get the input for',
      required: true
    } )
  };

  static override flags = {
    'run-id': Flags.string( {
      description: 'Specific run id to target (defaults to the latest run)'
    } ),
    'output-file': Flags.string( {
      char: 'o',
      description: 'Write the input JSON to this file instead of stdout'
    } ),
    force: Flags.boolean( {
      char: 'f',
      default: false,
      description: 'Overwrite the output file if it already exists'
    } )
  };

  async run(): Promise<unknown> {
    const { args, flags } = await this.parse( WorkflowInput );
    const runId = flags['run-id'];
    const outputFile = flags['output-file'];

    const response = runId ?
      await getWorkflowIdRunsRidInput( args.workflowId, runId ) :
      await getWorkflowIdInput( args.workflowId );

    if ( !response || !response.data ) {
      this.error( 'API returned invalid response', { exit: 1 } );
    }

    const data = response.data as WorkflowInputResponse;
    const input = data.input;
    const json = JSON.stringify( input, null, 2 );

    if ( outputFile ) {
      const destPath = path.resolve( process.cwd(), outputFile );
      const fileExists = await fs.access( destPath ).then( () => true ).catch( () => false );

      if ( fileExists && !flags.force ) {
        this.error(
          `File already exists at ${destPath}. Use --force to overwrite or choose a different --output-file.`,
          { exit: 1 }
        );
      }

      await fs.writeFile( destPath, `${json}\n`, 'utf-8' );
      this.logToStderr( `Wrote workflow input to ${destPath}` );
      // Don't return the bare input here: under --json oclif serializes run()'s return value to
      // stdout, which would duplicate the input we just wrote to the file. Return a status object
      // so --json emits a confirmation instead, and non-json mode keeps stdout empty.
      return { outputFile: destPath };
    }

    // Emit only the bare input (never the response envelope) so every mode yields the same
    // pipeable value (e.g. `output workflow input <id> | jq .`). Under --json oclif serializes
    // run()'s return value, which is also the bare input, so skip the manual log here.
    if ( !this.jsonEnabled() ) {
      this.log( json );
    }

    return input;
  }

  async catch( error: Error ): Promise<void> {
    return handleApiError( error, ( ...args ) => this.error( ...args ), {
      404: 'Workflow not found. Check the workflow ID.'
    } );
  }
}
