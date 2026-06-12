import { step, z } from '@outputai/core';

export const getANumber = step( {
  name: 'get_a_number',
  description: 'Generate one number',
  inputSchema: z.number(),
  outputSchema: z.number(),
  fn: async seed => Math.ceil( Math.random() * seed )
} );
