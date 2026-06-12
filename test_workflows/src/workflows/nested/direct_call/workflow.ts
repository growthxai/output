import { workflow, z } from '@outputai/core';
import child from './child/workflow.js';

export default workflow( {
  name: 'nested_direct_call',
  description: 'Nested direct call test',
  outputSchema: z.object( {
    value: z.string()
  } ),
  fn: async () => {
    const { value } = await child();
    return { value };
  }
} );
