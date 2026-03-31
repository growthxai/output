import { Args, Command, Flags } from '@oclif/core';
import { UserCancelledError } from '#types/errors.js';
import { runInit } from '#services/project_scaffold.js';
import { getErrorMessage } from '#utils/error_utils.js';

export default class Init extends Command {
  static description = 'Initialize a new Output project by scaffolding the complete project structure';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> my-workflow-project'
  ];

  static args = {
    folderName: Args.string( {
      description: 'Optional folder name for the project (skips folder name prompt)',
      required: false
    } )
  };

  static flags = {
    'skip-env': Flags.boolean( {
      description: 'Skip interactive environment variable configuration',
      default: false
    } )
  };

  async run(): Promise<void> {
    try {
      const { args, flags } = await this.parse( Init );

      await runInit( flags['skip-env'], args.folderName );
    } catch ( error: unknown ) {
      if ( error instanceof UserCancelledError ) {
        this.log( error.message );
        return;
      }

      // runInit handles cleanup internally and throws Error with message
      this.error( getErrorMessage( error ) );
    }
  }
}
