import { step } from '@outputai/core';
import { FooError } from './types.js';

export const thrower = step( {
  name: 'thrower',
  description: 'Ill throw!',
  fn: async () => {
    throw new FooError( 'Foo' );
  }
} );
