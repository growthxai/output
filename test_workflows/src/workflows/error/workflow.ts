import { workflow, z } from '@outputai/core';
import { thrower } from './steps.js';

export default workflow( {
  name: 'test_error',
  description: 'A workflow to test errors',
  outputSchema: z.object( {
    result: z.number()
  } ),
  fn: async () => {
    const result = await thrower();
    return { result };
  }
} );
