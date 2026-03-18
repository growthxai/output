import { workflow, z } from '@outputai/core';
import { readCredential, readEnvCredential } from './steps.js';

export default workflow( {
  name: 'credentials_demo',
  description: 'Demonstrates reading from encrypted credentials directly and via env var injection',
  inputSchema: z.object( {
    path: z.string().describe( 'Dot-notation path to the credential' )
  } ),
  outputSchema: z.object( {
    directValue: z.union( [ z.string(), z.number(), z.null() ] ),
    envValue: z.string().nullable()
  } ),
  fn: async ( { path } ) => {
    const directValue = await readCredential( path );
    const envValue = await readEnvCredential( 'DEMO_CREDENTIAL' );
    return { directValue, envValue };
  }
} );
