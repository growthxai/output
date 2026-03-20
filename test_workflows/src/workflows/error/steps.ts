import { step } from '@outputai/core';

export const thrower = step( {
  name: 'thrower',
  description: 'Ill throw!',
  fn: async () => {
    throw new Error( 'Foo' );
  }
} );
