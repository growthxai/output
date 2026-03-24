import { password, confirm } from '@inquirer/prompts';
import fs from 'node:fs';
import path from 'node:path';
import { ux } from '@oclif/core';
import { load as parseYaml, dump as stringifyYaml } from 'js-yaml';
import { UserCancelledError } from '#types/errors.js';
import { getErrorMessage } from '#utils/error_utils.js';
import { writeEncryptedAtPath } from './credentials_service.js';

const FILL_MARKER = '<FILL_ME_OUT>';
const CREDENTIALS_TEMPLATE = path.join( 'config', 'credentials.yml.template' );

type CredentialsObject = Record<string, unknown>;

interface SecretField {
  path: string[];
  label: string;
}

const findSecretFields = ( obj: CredentialsObject, prefix: string[] = [] ): SecretField[] =>
  Object.entries( obj ).flatMap( ( [ key, value ] ) => {
    const fieldPath = [ ...prefix, key ];
    if ( value === FILL_MARKER ) {
      return [ { path: fieldPath, label: fieldPath.join( '.' ) } ];
    }
    if ( typeof value === 'object' && value !== null ) {
      return findSecretFields( value as CredentialsObject, fieldPath );
    }
    return [];
  } );

const setAtPath = ( obj: CredentialsObject, [ head, ...tail ]: string[], value: string ): void => {
  if ( tail.length === 0 ) {
    obj[head] = value;
  } else {
    setAtPath( obj[head] as CredentialsObject, tail, value );
  }
};

export async function configureCredentials(
  projectPath: string,
  skipPrompt: boolean = false
): Promise<boolean> {
  try {
    const templatePath = path.join( projectPath, CREDENTIALS_TEMPLATE );

    if ( !fs.existsSync( templatePath ) ) {
      return false;
    }

    if ( skipPrompt ) {
      return false;
    }

    const shouldConfigure = await confirm( {
      message: 'Would you like to configure API credentials now?',
      default: true
    } );

    if ( !shouldConfigure ) {
      return false;
    }

    const templateContent = fs.readFileSync( templatePath, 'utf-8' );
    const parsed = parseYaml( templateContent ) as CredentialsObject;
    const secretFields = findSecretFields( parsed );

    if ( secretFields.length === 0 ) {
      return false;
    }

    for ( const field of secretFields ) {
      const value = await password( {
        message: `${field.label} (secret):`,
        mask: true
      } );
      setAtPath( parsed, field.path, value || '' );
    }

    writeEncryptedAtPath( projectPath, stringifyYaml( parsed ) );

    return true;
  } catch ( error ) {
    if ( error instanceof Error && error.name === 'ExitPromptError' ) {
      throw new UserCancelledError();
    }
    ux.warn( `Failed to configure credentials: ${getErrorMessage( error )}` );
    return false;
  }
}
