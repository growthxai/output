import { step, z } from '@outputai/core';

export const sumValues = step( {
  name: 'sumValues',
  description: 'Sum all values',
  inputSchema: z.array( z.number() ),
  outputSchema: z.number(),
  fn: async numbers => numbers.reduce( ( v, n ) => v + n, 0 )
} );
