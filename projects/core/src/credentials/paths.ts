import { resolve } from 'node:path';

export const resolveKeyEnvVar = ( environment?: string ): string => environment ?
  `OUTPUT_CREDENTIALS_KEY_${environment.toUpperCase()}` :
  'OUTPUT_CREDENTIALS_KEY';

export const resolveWorkflowKeyEnvVar = ( workflowName: string ): string =>
  `OUTPUT_CREDENTIALS_KEY_${workflowName.toUpperCase()}`;

export const resolveCredentialsPath = ( baseDir: string, environment?: string ): string => environment ?
  resolve( baseDir, `config/credentials/${environment}.yml.enc` ) :
  resolve( baseDir, 'config/credentials.yml.enc' );

export const resolveKeyPath = ( baseDir: string, environment?: string ): string => environment ?
  resolve( baseDir, `config/credentials/${environment}.key` ) :
  resolve( baseDir, 'config/credentials.key' );

export const resolveWorkflowCredentialsPath = ( workflowDir: string ): string =>
  resolve( workflowDir, 'credentials.yml.enc' );

export const resolveWorkflowKeyPath = ( workflowDir: string ): string =>
  resolve( workflowDir, 'credentials.key' );

export const getNestedValue = ( obj: unknown, dotPath: string ): unknown =>
  dotPath.split( '.' ).reduce(
    ( acc: unknown, part ) =>
      acc && typeof acc === 'object' ? ( acc as Record<string, unknown> )[part] : undefined,
    obj
  );
