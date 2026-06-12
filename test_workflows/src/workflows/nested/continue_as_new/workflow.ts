import { workflow, z } from '@outputai/core';
import child from './child/workflow.js';

export default workflow( {
  name: 'nested_continue_as_new',
  description: 'Nested calling child that continue as new',
  outputSchema: z.object( {
    results: z.array( z.string() )
  } ),
  fn: async () => child( { results: [] } )
} );
