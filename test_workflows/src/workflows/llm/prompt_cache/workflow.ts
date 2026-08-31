import { workflow } from '@outputai/core';
import { exercisePromptCache } from './steps.js';
import { workflowInputSchema, workflowOutputSchema } from './types.js';

export default workflow( {
  name: 'prompt_cache',
  description: 'Produces Anthropic cache-read and cache-write usage in the same LLM response',
  inputSchema: workflowInputSchema,
  outputSchema: workflowOutputSchema,
  fn: async input => exercisePromptCache( input )
} );
