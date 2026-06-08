import { Args, Command, Flags } from '@oclif/core';
import { confirm } from '@inquirer/prompts';
import { load as parseYaml, dump as stringifyYaml } from 'js-yaml';
import { seal } from '@outputai/credentials';
import { getErrorMessage } from '#utils/error_utils.js';
import {
  decryptCredentials,
  credentialsExist,
  writeEncrypted,
  resolveCredentialsPath,
  isSealedCredentials,
  readSealedDocument,
  writeSealedDocument,
  resolveRecipientPublicKey
} from '#services/credentials_service.js';

type CredentialsObject = Record<string, unknown>;

type PathConflict =
  { kind: 'primitive_to_object'; atPath: string; existingValue: unknown } |
  { kind: 'object_to_primitive'; atPath: string; existingValue: unknown };

type WalkState =
  { done: false; cursor: CredentialsObject } |
  { done: true; conflict: PathConflict | null };

const isPlainObject = ( value: unknown ): value is CredentialsObject =>
  typeof value === 'object' && value !== null && !Array.isArray( value );

const detectPathConflict = ( obj: CredentialsObject, dotPath: string ): PathConflict | null => {
  const parts = dotPath.split( '.' );
  const intermediateKeys = parts.slice( 0, -1 );
  const leafKey = parts[parts.length - 1];

  const walked = intermediateKeys.reduce<WalkState>( ( state, key, i ) => {
    if ( state.done ) {
      return state;
    }
    const next = state.cursor[key];
    if ( next === undefined ) {
      return { done: true, conflict: null };
    }
    if ( !isPlainObject( next ) ) {
      return {
        done: true,
        conflict: {
          kind: 'primitive_to_object',
          atPath: parts.slice( 0, i + 1 ).join( '.' ),
          existingValue: next
        }
      };
    }
    return { done: false, cursor: next };
  }, { done: false, cursor: obj } );

  if ( walked.done ) {
    return walked.conflict;
  }

  const leaf = walked.cursor[leafKey];
  if ( leaf !== undefined && ( isPlainObject( leaf ) || Array.isArray( leaf ) ) ) {
    return { kind: 'object_to_primitive', atPath: dotPath, existingValue: leaf };
  }
  return null;
};

const setNestedValue = ( obj: CredentialsObject, dotPath: string, value: string ): void => {
  const parts = dotPath.split( '.' );
  const parent = parts.slice( 0, -1 ).reduce<CredentialsObject>( ( current, key ) => {
    if ( !isPlainObject( current[key] ) ) {
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
    } ),
    yes: Flags.boolean( {
      char: 'y',
      description: 'Skip confirmation prompts when overwriting a value of a different shape',
      default: false
    } )
  };

  private async confirmOverwrite( conflict: PathConflict, newPath: string ): Promise<boolean> {
    if ( conflict.kind === 'primitive_to_object' ) {
      this.warn(
        `Writing to "${newPath}" will convert "${conflict.atPath}" from a value into an object, ` +
        `discarding its current value (${JSON.stringify( conflict.existingValue )}).`
      );
    } else {
      this.warn(
        `Writing to "${newPath}" will replace the existing object at that path ` +
        `(${JSON.stringify( conflict.existingValue )}) with a string value.`
      );
    }
    return confirm( { message: 'Continue?', default: false } );
  }

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

    try {
      // Sealed credentials: seal the single new value with the committed public key.
      // The other values stay sealed and the private key is never needed.
      if ( isSealedCredentials( environment, workflow ) ) {
        const recipient = resolveRecipientPublicKey( environment, workflow );
        const { recipient: fileRecipient, data } = readSealedDocument( environment, workflow );

        // If the committed public key was rotated away from the recipient the existing
        // values were sealed to, "set" cannot re-seal those values (no private key, no
        // plaintext) — writing here would leave a file with two recipients. Refuse.
        if ( fileRecipient && fileRecipient !== recipient ) {
          this.error(
            `The committed public key (${recipient}) does not match the recipient the existing ` +
            `credentials were sealed to (${fileRecipient}). "set" cannot re-seal existing values. ` +
            'Re-seal with "output credentials edit" (which decrypts and re-seals everything), ' +
            'or restore the matching public key, before adding new values.'
          );
        }

        const conflict = detectPathConflict( data, args.path );
        if ( conflict && !flags.yes ) {
          const shouldContinue = await this.confirmOverwrite( conflict, args.path );
          if ( !shouldContinue ) {
            this.log( 'Aborted.' );
            return;
          }
        }

        setNestedValue( data, args.path, seal( args.value, recipient ) );
        writeSealedDocument( environment, recipient, data, workflow );
        this.log( `Set ${args.path}` );
        return;
      }

      const plaintext = decryptCredentials( environment, workflow );
      const data = ( parseYaml( plaintext ) || {} ) as CredentialsObject;

      const conflict = detectPathConflict( data, args.path );
      if ( conflict && !flags.yes ) {
        const shouldContinue = await this.confirmOverwrite( conflict, args.path );
        if ( !shouldContinue ) {
          this.log( 'Aborted.' );
          return;
        }
      }

      setNestedValue( data, args.path, args.value );

      writeEncrypted( environment, stringifyYaml( data ), workflow );
    } catch ( error ) {
      if ( error instanceof Error && error.constructor.name === 'ExitPromptError' ) {
        return;
      }
      this.error( `Failed to update credentials: ${getErrorMessage( error )}` );
    }

    this.log( `Set ${args.path}` );
  }
}
