import { Command, Flags } from '@oclif/core';
import {
  validateDockerEnvironment,
  stopDockerCompose,
  resolveDockerComposePath
} from '#services/docker.js';
import { getErrorMessage } from '#utils/error_utils.js';

export default class DevDown extends Command {
  static description = [
    'Stop Output development services started by `output dev`',
    '',
    'Useful after `output dev -d`, or when an attached `output dev` session',
    'left the services running on quit.'
  ].join( '\n' );

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --compose-file ./custom-docker-compose.yml'
  ];

  static args = {};

  static flags = {
    'compose-file': Flags.string( {
      description: 'Path to a custom docker-compose file',
      required: false,
      char: 'f'
    } )
  };

  async run(): Promise<void> {
    const { flags } = await this.parse( DevDown );

    validateDockerEnvironment();

    const dockerComposePath = await resolveDockerComposePath( flags['compose-file'] );

    try {
      await stopDockerCompose( dockerComposePath );
    } catch ( error ) {
      this.error( getErrorMessage( error ), { exit: 1 } );
    }
  }
}
