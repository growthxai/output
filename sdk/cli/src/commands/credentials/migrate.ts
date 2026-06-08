import { Command, Flags } from '@oclif/core';
import { confirm } from '@inquirer/prompts';
import { resolveKeyEnvVar, resolveWorkflowKeyEnvVar } from '@outputai/credentials';
import { getErrorMessage } from '#utils/error_utils.js';
import {
  credentialsExist,
  isSealedCredentials,
  migrateToSealed,
  resolveCredentialsPath
} from '#services/credentials_service.js';

export default class CredentialsMigrate extends Command {
  static override description =
    'Migrate a legacy (symmetric) credentials file to asymmetric (sealed) form. Decrypts with the ' +
    'current key, generates a new keypair, seals every value to it, and writes a new private key.';

  static override examples = [
    '<%= config.bin %> <%= command.id %> --to-sealed --environment production',
    '<%= config.bin %> <%= command.id %> --to-sealed --workflow my_workflow'
  ];

  static override flags = {
    'to-sealed': Flags.boolean( {
      description: 'Convert the credentials file to sealed (asymmetric) form',
      default: false
    } ),
    environment: Flags.string( {
      char: 'e',
      description: 'Target environment (e.g. production, development)'
    } ),
    workflow: Flags.string( {
      char: 'w',
      description: 'Target a specific workflow directory'
    } ),
    yes: Flags.boolean( {
      char: 'y',
      description: 'Skip the confirmation prompt',
      default: false
    } )
  };

  async run(): Promise<void> {
    const { flags } = await this.parse( CredentialsMigrate );
    const environment = flags.environment;
    const workflow = flags.workflow;

    if ( environment && workflow ) {
      this.error( 'Cannot specify both --environment and --workflow.' );
    }

    if ( !flags['to-sealed'] ) {
      this.error( 'Specify a migration direction. Currently supported: --to-sealed.' );
    }

    if ( !credentialsExist( environment, workflow ) ) {
      this.error(
        `No credentials file found at ${resolveCredentialsPath( environment, workflow )}. Run "output credentials init" first.`
      );
    }

    if ( isSealedCredentials( environment, workflow ) ) {
      this.error( `Credentials at ${resolveCredentialsPath( environment, workflow )} are already sealed.` );
    }

    if ( !flags.yes ) {
      this.warn(
        'This rewrites the credentials file and REPLACES the key file with a new private key. ' +
        'The old symmetric key will no longer decrypt this file.'
      );
      const shouldContinue = await confirm( { message: 'Continue?', default: false } ).catch( () => false );
      if ( !shouldContinue ) {
        this.log( 'Aborted.' );
        return;
      }
    }

    try {
      const { keyPath, pubPath, credPath, privateKey } = migrateToSealed( environment, workflow );
      const envVar = workflow ? resolveWorkflowKeyEnvVar( workflow ) : resolveKeyEnvVar( environment );

      this.log( '' );
      this.log( `Sealed credentials: ${credPath}` );
      this.log( `Wrote public key:   ${pubPath}  (COMMIT this)` );
      this.log( `Wrote private key:  ${keyPath}  (gitignored — keep secret)` );
      this.log( '' );
      this.log( 'Next steps:' );
      this.log( `  1. Commit ${pubPath} and the credentials file.` );
      this.log( `  2. Set the new private key in your runtime as ${envVar}:` );
      this.log( '' );
      this.log( `     ${privateKey}` );
      this.log( '' );
      this.log( '  3. Store the private key in your secret manager (e.g. 1Password).' );
      this.log( '  4. Verify with: output credentials verify' );
    } catch ( error ) {
      this.error( `Migration failed: ${getErrorMessage( error )}` );
    }
  }
}
