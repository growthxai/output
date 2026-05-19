import { workflow } from '@outputai/core';
import { call } from './steps.js';

export default workflow( {
  name: 'http_error',
  description: 'Demonstrates a failed HTTP call',
  fn: async () => {
    await call();
  },
  options: {
    activityOptions: {
      retry: {
        maximumAttempts: 1
      }
    }
  }
} );
