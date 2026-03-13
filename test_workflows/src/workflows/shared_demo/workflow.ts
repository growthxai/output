import { workflow, z } from '@outputai/core';
import { sumValues } from './steps.js';
import { sharedSumValues } from '../../shared/steps/tools.js';

export default workflow( {
  name: 'shared_demo',
  description: 'Workflow with shared steps',
  outputSchema: z.array( z.number() ),
  fn: async () => {
    const result1 = await sumValues( [ 1, 2, 3 ] );
    const result2 = await sharedSumValues( [ 4, 5, 6 ] );
    return [ result1, result2 ];
  }
} );
