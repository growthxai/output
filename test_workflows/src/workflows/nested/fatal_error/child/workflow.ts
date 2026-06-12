import { workflow } from '@outputai/core';
import { thrower } from './steps.js';

export default workflow( {
  name: 'nested_fatal_error_child',
  description: 'Second level',
  fn: async () => {
    await thrower();
  }
} );
