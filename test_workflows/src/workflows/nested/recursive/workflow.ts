import { workflow, z } from '@outputai/core';
import { invokeChild } from './helper.js';

export default workflow( {
  name: 'nested_recursive',
  description: 'Nested call the workflow itself recursively',
  inputSchema: z.object( {
    currentDepth: z.number()
  } ).optional(),
  fn: async ( { currentDepth } = { currentDepth: 0 } ) => {
    if ( currentDepth < 3 ) {
      await invokeChild( currentDepth + 1 );
    }
  }
} );
