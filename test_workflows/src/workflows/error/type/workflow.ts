import { hasErrorType, workflow, z } from '@outputai/core';
import { thrower } from './steps.js';
import { FooError } from './types.js';

export default workflow( {
  name: 'error_type',
  description: 'Verify that typed errors threw in user code can be intercepted',
  outputSchema: z.string(),
  fn: async () => {
    try {
      await thrower();
      return 'Function didn\'t throw error. This is unexpected';
    } catch ( error ) {
      if ( hasErrorType( error, FooError ) ) {
        return 'User error was typed properly';
      }
      throw error;
    }
  },
  options: {
    activityOptions: {
      retry: {
        maximumAttempts: 1
      }
    }
  }
} );
