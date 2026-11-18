import { Command, Flags } from '@oclif/core';
import {
  initCredentials,
  resolveCredentialsPath,
  resolveKeyPath,
  credentialsExist
} from '#services/credentials_service.js';

export default class CredentialsInit extends Command {
  static override description = 'Initialize encrypted credentials file and master key';

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
    } ),
    force: Flags.boolean( {
      char: 'f',
      description: 'Overwrite existing credentials',
      default: false
    } )
  };

  async run(): Promise<void> {
    const { flags } = await this.parse( CredentialsInit );
    const environment = flags.environment;
    const workflow = flags.workflow;

    if ( environment && workflow ) {
      this.error( 'Cannot specify both --environment and --workflow.' );
    }

    if ( !flags.force && credentialsExist( environment, workflow ) ) {
      this.error(
        `Credentials already exist at ${resolveCredentialsPath( environment, workflow )}. Use --force to overwrite.`
      );
    }

    const { keyPath, credPath } = initCredentials( environment, workflow );

    this.log( '' );
    this.log( `Created key:         ${keyPath}` );
    this.log( `Created credentials: ${credPath}` );
    this.log( '' );
    this.log( 'IMPORTANT: Add the key file to .gitignore:' );
    this.log( `  ${resolveKeyPath( environment, workflow )}` );
    this.log( '' );
    this.log( 'Edit credentials with: output credentials edit' );
  }
}
