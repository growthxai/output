import { workflow } from '@outputai/core';
import { thrower } from './steps.js';

export default workflow( {
  name: 'test_error',
  description: 'A workflow to test errors',
  fn: async () => {
    await thrower();
  }
} );
