import { workflow, z } from '@outputai/core';
import child from './child/workflow.js';

export default workflow( {
  name: 'nested_parallel_children',
  description: 'Nested parallel child workflow calls',
  outputSchema: z.object( {
    values: z.array( z.string() )
  } ),
  fn: async () => {
    const childCalls = [ 1, 2, 3 ].map( index => child( { index } ) );
    const results = await Promise.all( childCalls );

    return { values: results.map( ( { value } ) => value ) };
  }
} );
