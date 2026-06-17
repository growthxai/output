import { step, z } from '@outputai/core';

export const getANumber = step( {
  name: 'get_a_number',
  description: 'Generate one number',
  outputSchema: z.number(),
  fn: async () => Math.ceil( Math.random() * 1000 )
} );
