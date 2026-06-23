import { Args, Command } from '@oclif/core';
import { displayDebugTree } from '#utils/trace_formatter.js';
import { getTrace } from '#services/trace_reader.js';
import { handleApiError } from '#utils/error_handler.js';

export default class WorkflowDebug extends Command {
  static override description = 'Get and display workflow execution trace for debugging';

  static override enableJsonFlag = true;

  static override examples = [
    '<%= config.bin %> <%= command.id %> wf-12345',
    '<%= config.bin %> <%= command.id %> wf-12345 --json'
  ];

  static override args = {
    workflowId: Args.string( {
      description: 'The workflow ID to debug',
      required: true
    } )
  };

  async run(): Promise<unknown> {
    const { args } = await this.parse( WorkflowDebug );

    this.log( `Fetching debug information for workflow: ${args.workflowId}...` );

    const { data: traceData, location } = await getTrace( args.workflowId );
    const source = location.isRemote ? 'remote' : 'local';

    this.log( `Trace source: ${source}${!location.isRemote ? ` (${location.path})` : ''}` );

    if ( !this.jsonEnabled() ) {
      this.displayTextTrace( traceData );
    }

    return traceData;
  }

  private displayTextTrace( traceData: unknown ): void {
    this.log( '\nTrace Log:' );
    this.log( '─'.repeat( 80 ) );
    this.log( displayDebugTree( traceData ) );
    this.log( '\n' + '─'.repeat( 80 ) );
    this.log( 'Tip: Use --json for the full untruncated trace' );
  }

  async catch( error: Error ): Promise<void> {
    return handleApiError( error, ( ...args ) => this.error( ...args ), {
      404: 'Workflow not found or trace not available. Check the workflow ID.'
    } );
  }
}
