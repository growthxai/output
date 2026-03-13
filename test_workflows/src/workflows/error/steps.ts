import { step, z } from '@outputai/core';

export const thrower = step( {
  name: 'thrower',
  description: 'Ill throw!',
  outputSchema: z.number(),
  fn: async () => {
    throw new Error( 'Foo' );
    return 5;
  }
} );
