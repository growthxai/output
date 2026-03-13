import { step } from '@outputai/core';
import { getExecutionContext } from '@outputai/core/sdk_activity_integration';

export const demoContext = step( {
  name: 'demo_context',
  description: 'Show get context',
  fn: async () => {
    const context = getExecutionContext();
    console.log( { context } );
  }
} );
