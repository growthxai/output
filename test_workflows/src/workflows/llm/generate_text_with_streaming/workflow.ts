import { workflow } from '@outputai/core';
import { generateStreamedContent } from './steps.js';
import { workflowInputSchema, workflowOutputSchema } from './types.js';

export default workflow( {
  name: 'generate_text_with_streaming',
  description: 'Tests completed text generation over streaming transport',
  inputSchema: workflowInputSchema,
  outputSchema: workflowOutputSchema,
  fn: async input => generateStreamedContent( input )
} );
