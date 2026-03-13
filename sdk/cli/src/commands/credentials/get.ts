import { Args, Command, Flags } from '@oclif/core';
import { load as parseYaml } from 'js-yaml';
import { getNestedValue } from '@outputai/credentials';
import {
  decryptCredentials,
  credentialsExist,
  resolveCredentialsPath
} from '#services/credentials_service.js';

export default class CredentialsGet extends Command {
  static override description = 'Get a specific credential value by dot-notation path';

  static override examples = [
    '<%= config.bin %> <%= command.id %> anthropic.api_key',
    '<%= config.bin %> <%= command.id %> aws.region --environment production',
    '<%= config.bin %> <%= command.id %> stripe.key --workflow my_workflow'
  ];

  static override args = {
    path: Args.string( {
      description: 'Dot-notation path to the credential (e.g. anthropic.api_key)',
      required: true
    } )
  };

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
    const { args, flags } = await this.parse( CredentialsGet );
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
    const data = parseYaml( plaintext );
    const value = getNestedValue( data, args.path );

    if ( value === undefined || value === null ) {
      this.error( `Credential not found: ${args.path}` );
    }

    this.log( typeof value === 'object' ? JSON.stringify( value, null, 2 ) : String( value ) );
  }
}
