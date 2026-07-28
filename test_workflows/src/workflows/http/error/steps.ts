import { step } from '@outputai/core';
import { outputFetch } from '@outputai/http';

export const call = step( {
  name: 'call',
  description: 'Make a broken http call',
  fn: async () => {
    await outputFetch( 'https://coolbeans.sofax' );
  }
} );
