import { workflow, z } from '@outputai/core';
import { generateWithBrokenStore } from './steps.js';

export default workflow( {
  name: 'agent_store_failure',
  description: 'Agent.generate must bill usage and cost when message persistence fails after the response',
  outputSchema: z.string(),
  fn: async () => generateWithBrokenStore()
} );
