import { workflow, z } from '@outputai/core';

export default workflow( {
  name: 'slow',
  description: 'A workflow simulating a slow task',
  outputSchema: z.number(),
  fn: async () => {
    await new Promise( resolve => setTimeout( resolve, 10_000 ) );
    return 1;
  }
} );
