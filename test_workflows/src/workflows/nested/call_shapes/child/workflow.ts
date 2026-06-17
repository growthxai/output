import { workflow, z } from '@outputai/core';
import { getANumber } from './steps.js';

export default workflow( {
  name: 'call_shape_child',
  description: 'Second Level',
  inputSchema: z.object( {
    seed: z.number()
  } ),
  outputSchema: z.number(),
  fn: async input => getANumber( input.seed )
} );
