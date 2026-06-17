import { workflow, z } from '@outputai/core';
import { getANumber } from './steps.js';

export default workflow( {
  name: 'call_shape_child_no_args',
  description: 'Second Level',
  outputSchema: z.number(),
  fn: async () => getANumber()
} );
