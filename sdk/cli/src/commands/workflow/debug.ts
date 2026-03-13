import { Args, Command, Flags } from '@oclif/core';
import { OUTPUT_FORMAT } from '#utils/constants.js';
import { displayDebugTree } from '#utils/trace_formatter.js';
import { getTrace } from '#services/trace_reader.js';
import { handleApiError } from '#utils/error_handler.js';

export default class WorkflowDebug extends Command {
  static override description = 'Get and display workflow execution trace for debugging';

  static override examples = [
    '<%= config.bin %> <%= command.id %> wf-12345',
    '<%= config.bin %> <%= command.id %> wf-12345 --format json',
    '<%= config.bin %> <%= command.id %> wf-12345 --format text'
  ];

  static override args = {
    workflowId: Args.string( {
      description: 'The workflow ID to debug',
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
    const { args, flags } = await this.parse( WorkflowDebug );
    const isJsonFormat = flags.format === OUTPUT_FORMAT.JSON;

    this.conditionalLog( `Fetching debug information for workflow: ${args.workflowId}...`, isJsonFormat );

    const { data: traceData, location } = await getTrace( args.workflowId );
    const source = location.isRemote ? 'remote' : 'local';

    this.conditionalLog( `Trace source: ${source}${!location.isRemote ? ` (${location.path})` : ''}`, isJsonFormat );

    if ( isJsonFormat ) {
      this.outputJson( traceData );
      return;
    }

    this.displayTextTrace( traceData );
  }

  private conditionalLog( message: string, disabled: boolean ): void {
    if ( !disabled ) {
      this.log( message );
    }
  }

  private outputJson( data: unknown ): void {
    this.log( JSON.stringify( data, null, 2 ) );
  }

  private displayTextTrace( traceData: unknown ): void {
    this.log( '\nTrace Log:' );
    this.log( '─'.repeat( 80 ) );
    this.log( displayDebugTree( traceData ) );
    this.log( '\n' + '─'.repeat( 80 ) );
    this.log( 'Tip: Use --format json for the full untruncated trace' );
  }

  async catch( error: Error ): Promise<void> {
    return handleApiError( error, ( ...args ) => this.error( ...args ), {
      404: 'Workflow not found or trace not available. Check the workflow ID.'
    } );
  }
}
