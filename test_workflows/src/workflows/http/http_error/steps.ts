import { step } from '@outputai/core';
import { instrumentedFetch } from '@outputai/http';

export const call = step( {
  name: 'call',
  description: 'Make a broken http call',
  fn: async () => {
    await instrumentedFetch( 'https://coolbeans.sofax' );
  }
} );
