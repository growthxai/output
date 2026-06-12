import { workflow, z } from '@outputai/core';
import { processNumbers } from '@growthxlabs/workflows_catalog';

export default workflow( {
  name: 'nested_external',
  description: 'Calling nested external workflow',
  outputSchema: z.object( {
    values: z.array( z.number() ),
    summation: z.number(),
    subtraction: z.number()
  } ),
  fn: async () => {
    const values = [ 3, 2, 1 ];

    const { summation, subtraction } = await processNumbers( { values } );

    return { values, summation, subtraction };
  }
} );
