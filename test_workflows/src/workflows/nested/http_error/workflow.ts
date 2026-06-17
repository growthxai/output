import { workflow } from '@outputai/core';
import child from './child/workflow.js';

export default workflow( {
  name: 'nested_http_error',
  description: 'Nested with http error',
  fn: async () => child(),
  options: {
    activityOptions: {
      retry: {
        maximumAttempts: 1
      }
    }
  }
} );
