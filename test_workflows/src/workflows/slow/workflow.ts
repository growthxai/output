import { sleep, workflow, z } from '@outputai/core';

export default workflow( {
  name: 'slow',
  description: 'A workflow simulating a slow task',
  outputSchema: z.number(),
  fn: async () => {
    await sleep( '30s' );
    return 1;
  }
} );
