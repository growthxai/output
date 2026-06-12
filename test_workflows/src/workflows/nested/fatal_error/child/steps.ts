import { step, FatalError } from '@outputai/core';

export const thrower = step( {
  name: 'thrower',
  description: 'Ill throw!',
  fn: async () => {
    throw new FatalError( 'Foo' );
  }
} );
