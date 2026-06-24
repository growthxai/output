import { step } from '@outputai/core';
import { Context } from '@outputai/core/sdk/runtime';

export const demoContext = step( {
  name: 'demo_context',
  description: 'Show get context',
  fn: async () => {
    const context = Context.getActivityContext();
    console.log( { context } );
  }
} );
