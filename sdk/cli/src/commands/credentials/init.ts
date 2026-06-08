import { Command, Flags } from '@oclif/core';
import {
  initCredentials,
  initSealed,
  resolveCredentialsPath,
  resolveKeyPath,
  credentialsExist
} from '#services/credentials_service.js';

export default class CredentialsInit extends Command {
  static override description = 'Initialize encrypted credentials file and master key';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --environment production',
    '<%= config.bin %> <%= command.id %> --sealed --environment production',
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
    sealed: Flags.boolean( {
      char: 's',
      description: 'Use asymmetric (sealed) credentials: a committed public key encrypts, a private key decrypts',
      default: false
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

    if ( flags.sealed ) {
      const { keyPath, credPath, pubPath, publicKey } = initSealed( environment, workflow );

      this.log( '' );
      this.log( `Created private key: ${keyPath}` );
      this.log( `Created public key:  ${pubPath}` );
      this.log( `Created credentials: ${credPath}` );
      this.log( `Recipient public key: ${publicKey}` );
      this.log( '' );
      this.log( 'IMPORTANT: Add the PRIVATE key file to .gitignore (keep it only in your runtime):' );
      this.log( `  ${keyPath}` );
      this.log( 'COMMIT the public key and the credentials file — they are safe to share.' );
      this.log( '' );
      this.log( 'Add credentials with: output credentials set <path> <value>  (no private key needed)' );
      return;
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
