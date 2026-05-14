import { step } from '@outputai/core';
import { fetch } from '@outputai/http';

export const call = step( {
  name: 'call',
  description: 'Make a broken http call',
  fn: async () => {
    await fetch( 'https://coolbeans.sofax' );
  }
} );
