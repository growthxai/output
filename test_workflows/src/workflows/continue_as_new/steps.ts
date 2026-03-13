import { step, z } from '@outputai/core';

export const increment = step( {
  name: 'increment',
  description: 'Increment',
  inputSchema: z.number(),
  outputSchema: z.number(),
  fn: async number => number + 1
} );
