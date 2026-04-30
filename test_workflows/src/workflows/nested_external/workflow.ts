import { workflow, z } from '@outputai/core';
import { sumNumbers } from '@growthxlabs/workflows_catalog';

export default workflow( {
  name: 'nested_external',
  description: 'A workflow to test nested external workflows workflows',
  outputSchema: z.object( {
    values: z.array( z.number() ),
    result: z.array( z.number() )
  } ),
  fn: async () => {
    const values = [ 3, 2, 1 ];
    const result : number[] = [];

    result.push( ( await sumNumbers( { values } ) ).result );

    return { values, result };
  }
} );
