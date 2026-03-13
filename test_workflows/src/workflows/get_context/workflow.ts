import { workflow } from '@outputai/core';
import { demoContext } from './steps.js';

export default workflow( {
  name: 'get_context',
  description: 'A simple workflow to show get context',
  fn: async () => {
    await demoContext();
  }
} );
