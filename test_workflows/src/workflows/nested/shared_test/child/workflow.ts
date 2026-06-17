import { workflow, z } from '@outputai/core';
import { sharedSumValues } from '../../../../shared/steps/tools.js';

export default workflow( {
  name: 'nested_shared_child',
  description: 'Second level',
  outputSchema: z.object( {
    value: z.number()
  } ),
  fn: async () => {
    const value = await sharedSumValues( [ 1, 2, 3 ] );
    return { value };
  }
} );
