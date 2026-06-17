import { workflow, z } from '@outputai/core';
import child from './child/workflow.js';

export default workflow( {
  name: 'nested_shared',
  description: 'Nested with shared steps',
  outputSchema: z.object( {
    value: z.number()
  } ),
  fn: async () => {
    const { value } = await child();
    return { value };
  }
} );
