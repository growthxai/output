import { workflow, z } from '@outputai/core';
import { sleep } from '@temporalio/workflow';

export default workflow( {
  name: 'nested_parallel_children_child',
  description: 'Parallel nested child workflow',
  inputSchema: z.object( {
    index: z.number()
  } ),
  outputSchema: z.object( {
    value: z.string()
  } ),
  fn: async ( { index } ) => {
    await sleep( '3s' );
    return {
      value: `child-${index}`
    };
  }
} );
