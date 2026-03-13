import { workflow, z } from '@outputai/core';
import { readCredential } from './steps.js';

export default workflow( {
  name: 'credentials_demo',
  description: 'Demonstrates reading from encrypted credentials',
  inputSchema: z.object( {
    path: z.string().describe( 'Dot-notation path to the credential' )
  } ),
  outputSchema: z.object( {
    value: z.union( [ z.string(), z.number(), z.null() ] )
  } ),
  fn: async ( { path } ) => {
    const value = await readCredential( path );
    return { value };
  }
} );
