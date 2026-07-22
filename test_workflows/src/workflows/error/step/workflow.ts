import { workflow } from '@outputai/core';
import { thrower } from './steps.js';

export default workflow( {
  name: 'error_step',
  description: 'A workflow to test errors',
  fn: async () => {
    await thrower();
  },
  options: {
    activityOptions: {
      retry: {
        maximumAttempts: 2
      }
    }
  }
} );
