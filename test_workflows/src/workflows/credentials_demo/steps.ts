import { step, z } from '@outputai/core';
import { credentials } from '@outputai/credentials';

export const readCredential = step( {
  name: 'readCredential',
  description: 'Read a value from encrypted credentials',
  inputSchema: z.string(),
  outputSchema: z.union( [ z.string(), z.number(), z.null() ] ),
  fn: async path => credentials.get( path, null ) as string | number | null
} );

export const readEnvCredential = step( {
  name: 'readEnvCredential',
  description: 'Read a credential injected into process.env via the credential: convention',
  inputSchema: z.string().describe( 'Environment variable name' ),
  outputSchema: z.string().nullable(),
  fn: async envVar => process.env[envVar] ?? null
} );
