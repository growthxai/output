import { Args, Command, Flags } from '@oclif/core';
import { load as parseYaml, dump as stringifyYaml } from 'js-yaml';
import {
  decryptCredentials,
  credentialsExist,
  writeEncrypted,
  resolveCredentialsPath
} from '#services/credentials_service.js';

type CredentialsObject = Record<string, unknown>;

const setNestedValue = ( obj: CredentialsObject, dotPath: string, value: string ): void => {
  const parts = dotPath.split( '.' );
  const parent = parts.slice( 0, -1 ).reduce<CredentialsObject>( ( current, key ) => {
    if ( !current[key] || typeof current[key] !== 'object' ) {
      current[key] = {};
    }
    return current[key] as CredentialsObject;
  }, obj );

  parent[parts[parts.length - 1]] = value;
};

export default class CredentialsSet extends Command {
  static override description = 'Set a credential value by dot-notation path';

  static override examples = [
    '<%= config.bin %> <%= command.id %> anthropic.api_key sk-ant-...',
    '<%= config.bin %> <%= command.id %> openai.api_key sk-... --environment production',
    '<%= config.bin %> <%= command.id %> stripe.key sk_live_... --workflow my_workflow'
  ];

  static override args = {
    path: Args.string( {
      description: 'Dot-notation path to the credential (e.g. anthropic.api_key)',
      required: true
    } ),
    value: Args.string( {
      description: 'Value to set',
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
    const { args, flags } = await this.parse( CredentialsSet );
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
    const data = ( parseYaml( plaintext ) || {} ) as CredentialsObject;

    setNestedValue( data, args.path, args.value );

    writeEncrypted( environment, stringifyYaml( data ), workflow );

    this.log( `Set ${args.path}` );
  }
}
