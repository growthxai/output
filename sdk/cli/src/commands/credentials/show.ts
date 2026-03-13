import { Command, Flags } from '@oclif/core';
import {
  decryptCredentials,
  credentialsExist,
  resolveCredentialsPath
} from '#services/credentials_service.js';

export default class CredentialsShow extends Command {
  static override description = 'Show decrypted credentials (for debugging)';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --environment production',
    '<%= config.bin %> <%= command.id %> --workflow my_workflow'
  ];

  static override flags = {
    environment: Flags.string( {
      char: 'e',
      description: 'Target environment (e.g. production, development)'
    } ),
    workflow: Flags.string( {
      char: 'w',
      description: 'Target a specific workflow directory'
    } )
  };

  async run(): Promise<void> {
    const { flags } = await this.parse( CredentialsShow );
    const environment = flags.environment;
    const workflow = flags.workflow;

    if ( environment && workflow ) {
      this.error( 'Cannot specify both --environment and --workflow.' );
    }

    if ( !credentialsExist( environment, workflow ) ) {
      this.error(
        `No credentials file found at ${resolveCredentialsPath( environment, workflow )}. Run "output credentials init" first.`
      );
    }

    const plaintext = decryptCredentials( environment, workflow );
    this.log( plaintext );
  }
}
