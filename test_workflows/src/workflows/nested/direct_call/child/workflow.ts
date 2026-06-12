import { workflow, z } from '@outputai/core';
import httpSimple from '../../../http_simple/workflow.js';

export default workflow( {
  name: 'nested_direct_call_child',
  description: 'Second level',
  outputSchema: z.object( {
    value: z.string()
  } ),
  fn: async () => {
    const value = await httpSimple();
    return { value };
  }
} );
