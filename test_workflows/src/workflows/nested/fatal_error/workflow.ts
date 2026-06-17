import { workflow } from '@outputai/core';
import child from './child/workflow.js';

export default workflow( {
  name: 'nested_fatal_error',
  description: 'Nested with fatal error',
  fn: async () => {
    await child();
  },
  options: {
    activityOptions: {
      retry: {
        maximumAttempts: 1
      }
    }
  }
} );
