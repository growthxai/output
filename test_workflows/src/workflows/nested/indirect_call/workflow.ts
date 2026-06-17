import { workflow, z } from '@outputai/core';
import { invokeChild } from './helper.js';

export default workflow( {
  name: 'nested_indirect_call',
  description: 'Nested indirect call test',
  outputSchema: z.object( {
    value: z.string()
  } ),
  fn: async () => {
    const { value } = await invokeChild();
    return { value };
  }
} );
