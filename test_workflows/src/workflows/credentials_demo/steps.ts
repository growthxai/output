import { step, z } from '@outputai/core';
import { credentials } from '@outputai/credentials';

export const readCredential = step( {
  name: 'readCredential',
  description: 'Read a value from encrypted credentials',
  inputSchema: z.string(),
  outputSchema: z.union( [ z.string(), z.number(), z.null() ] ),
  fn: async path => credentials.get( path, null ) as string | number | null
} );
