import { step, z } from '@outputai/core';

export const generateNumber = step( {
  name: 'generateNumber',
  description: 'Generate a random number',
  outputSchema: z.number(),
  fn: async () => Math.ceil( Math.random() * 1000 )
} );
