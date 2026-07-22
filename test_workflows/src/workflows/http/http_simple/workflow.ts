import { workflow, z } from '@outputai/core';
import { callHttpWithCost } from './steps.js';

export default workflow( {
  name: 'http_simple',
  description: 'A minimal HTTP workflow that records one request cost',
  outputSchema: z.string(),
  fn: async () => callHttpWithCost()
} );
