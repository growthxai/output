import fs from 'node:fs';
import path from 'node:path';
import { dump as stringifyYaml } from 'js-yaml';
import {
  encrypt, decrypt, generateKey,
  resolveCredentialsPath as resolveCredPath,
  resolveKeyPath as resolveKPath,
  resolveKeyEnvVar,
  resolveWorkflowCredentialsPath,
  resolveWorkflowKeyPath,
  resolveWorkflowKeyEnvVar
} from '@outputai/credentials';

export type CredentialsEnvironment = string | undefined;
export type WorkflowTarget = string | undefined;

const WORKFLOWS_DIR = path.join( 'src', 'workflows' );

const resolveWorkflowDir = ( workflow: string ): string =>
  path.resolve( process.cwd(), WORKFLOWS_DIR, workflow );

export const resolveCredentialsPath = ( environment: CredentialsEnvironment, workflow?: WorkflowTarget ): string =>
  workflow ?
    resolveWorkflowCredentialsPath( resolveWorkflowDir( workflow ) ) :
    resolveCredPath( process.cwd(), environment );

export const resolveKeyPath = ( environment: CredentialsEnvironment, workflow?: WorkflowTarget ): string =>
  workflow ?
    resolveWorkflowKeyPath( resolveWorkflowDir( workflow ) ) :
    resolveKPath( process.cwd(), environment );

export const resolveKey = ( environment: CredentialsEnvironment, workflow?: WorkflowTarget ): string => {
  if ( workflow ) {
    const wfEnvVar = resolveWorkflowKeyEnvVar( workflow );

    if ( process.env[wfEnvVar] ) {
      return process.env[wfEnvVar]!;
    }

    const wfKeyPath = resolveKeyPath( undefined, workflow );

    if ( fs.existsSync( wfKeyPath ) ) {
      return fs.readFileSync( wfKeyPath, 'utf8' ).trim();
    }

    return resolveKey( undefined );
  }

  const envVar = resolveKeyEnvVar( environment );

  if ( process.env[envVar] ) {
    return process.env[envVar]!;
  }

  const keyPath = resolveKeyPath( environment );

  if ( fs.existsSync( keyPath ) ) {
    return fs.readFileSync( keyPath, 'utf8' ).trim();
  }

  throw new Error( `No key found. Set ${envVar} env var or create ${keyPath}.` );
};

export const credentialsExist = ( environment: CredentialsEnvironment, workflow?: WorkflowTarget ): boolean =>
  fs.existsSync( resolveCredentialsPath( environment, workflow ) );

export const decryptCredentials = ( environment: CredentialsEnvironment, workflow?: WorkflowTarget ): string => {
  const key = resolveKey( environment, workflow );
  const credPath = resolveCredentialsPath( environment, workflow );

  if ( !fs.existsSync( credPath ) ) {
    throw new Error( `Credentials file not found: ${credPath}` );
  }

  const ciphertext = fs.readFileSync( credPath, 'utf8' ).trim();
  return decrypt( ciphertext, key );
};

export const writeEncrypted = ( environment: CredentialsEnvironment, plaintext: string, workflow?: WorkflowTarget ): void => {
  const key = resolveKey( environment, workflow );
  const credPath = resolveCredentialsPath( environment, workflow );

  fs.mkdirSync( path.dirname( credPath ), { recursive: true } );
  fs.writeFileSync( credPath, encrypt( plaintext, key ), 'utf8' );
};

export const initCredentials = ( environment: CredentialsEnvironment, workflow?: WorkflowTarget ): { keyPath: string; credPath: string } => {
  const credPath = resolveCredentialsPath( environment, workflow );
  const keyPath = resolveKeyPath( environment, workflow );

  fs.mkdirSync( path.dirname( keyPath ), { recursive: true } );
  fs.mkdirSync( path.dirname( credPath ), { recursive: true } );

  const key = generateKey();
  fs.writeFileSync( keyPath, key, { mode: 0o600 } );

  const template = stringifyYaml( {
    anthropic: { api_key: '' },
    openai: { api_key: '' }
  } );

  fs.writeFileSync( credPath, encrypt( template, key ), 'utf8' );

  return { keyPath, credPath };
};
