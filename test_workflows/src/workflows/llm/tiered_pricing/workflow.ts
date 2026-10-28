import { workflow } from '@outputai/core';
import { exerciseTieredPricing } from './steps.js';
import { workflowInputSchema, workflowOutputSchema } from './types.js';

export default workflow( {
  name: 'tiered_pricing',
  description: 'Exercises direct and multi-step context-tier LLM pricing',
  inputSchema: workflowInputSchema,
  outputSchema: workflowOutputSchema,
  fn: async input => exerciseTieredPricing( input )
} );
