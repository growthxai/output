import { readFileSync, existsSync } from 'node:fs';
import { load as parseYaml } from 'js-yaml';
import { decrypt } from './encryption.js';
import { InvalidCredentialsKeyError, MalformedCredentialsKeyError, MissingKeyError } from './errors.js';
import {
  resolveKeyEnvVar,
  resolveCredentialsPath,
  resolveKeyPath,
  resolveWorkflowCredentialsPath,
  resolveWorkflowKeyPath,
  resolveWorkflowKeyEnvVar
} from './paths.js';
import type { CredentialsProvider } from './types.js';

const resolveBaseDir = (): string => {
  const arg = process.argv[2];
  return ( arg && arg.startsWith( '/' ) ) ? arg : process.cwd();
};

const resolveKey = ( environment?: string ): string => {
  const envVarName = resolveKeyEnvVar( environment );

  if ( process.env[envVarName] ) {
    return process.env[envVarName]!;
  }

  const keyFilePath = resolveKeyPath( resolveBaseDir(), environment );

  if ( existsSync( keyFilePath ) ) {
    return readFileSync( keyFilePath, 'utf8' ).trim();
  }

  throw new MissingKeyError( environment );
};

const resolveWorkflowKey = ( workflowName: string, workflowDir: string ): string => {
  const envVarName = resolveWorkflowKeyEnvVar( workflowName );

  if ( process.env[envVarName] ) {
    return process.env[envVarName]!;
  }

  const keyPath = resolveWorkflowKeyPath( workflowDir );

  if ( existsSync( keyPath ) ) {
    return readFileSync( keyPath, 'utf8' ).trim();
  }

  return resolveKey( undefined );
};

const safeDecrypt = ( ciphertext: string, key: string, credPath: string ): string => {
  try {
    return decrypt( ciphertext, key );
  } catch ( error ) {
    if ( error instanceof RangeError ) {
      throw new MalformedCredentialsKeyError( credPath, error.message );
    }
    if ( error instanceof Error && error.message.includes( 'aes/gcm' ) ) {
      throw new InvalidCredentialsKeyError( credPath );
    }
    throw new InvalidCredentialsKeyError(
      credPath,
      error instanceof Error ? error.message : String( error )
    );
  }
};

const decryptYaml = ( credPath: string, key: string ): Record<string, unknown> => {
  const ciphertext = readFileSync( credPath, 'utf8' ).trim();
  const plaintext = safeDecrypt( ciphertext, key, credPath );
  return ( parseYaml( plaintext ) as Record<string, unknown> ) || {};
};

export const encryptedYamlProvider: CredentialsProvider = {
  loadGlobal: ( { environment } ) => {
    const baseDir = resolveBaseDir();
    const credPath = resolveCredentialsPath( baseDir, environment );

    if ( !existsSync( credPath ) ) {
      if ( environment ) {
        const defaultPath = resolveCredentialsPath( baseDir, undefined );

        if ( existsSync( defaultPath ) ) {
          return decryptYaml( defaultPath, resolveKey( undefined ) );
        }
      }

      return {};
    }

    return decryptYaml( credPath, resolveKey( environment ) );
  },

  loadForWorkflow: ( { workflowName, workflowDir } ) => {
    if ( !workflowDir ) {
      return null;
    }

    const credPath = resolveWorkflowCredentialsPath( workflowDir );

    if ( !existsSync( credPath ) ) {
      return null;
    }

    const key = resolveWorkflowKey( workflowName, workflowDir );
    return decryptYaml( credPath, key );
  }
};
