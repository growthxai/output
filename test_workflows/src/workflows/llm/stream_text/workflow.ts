import { workflow } from '@outputai/core';
import { workflowInputSchema, workflowOutputSchema } from './types.js';
import { generateStreamedContent } from './steps.js';

export default workflow( {
  name: 'stream_text',
  description: 'Demonstrates streamText streaming text generation',
  inputSchema: workflowInputSchema,
  outputSchema: workflowOutputSchema,
  fn: async ( { topic } ) => {
    return generateStreamedContent( { topic } );
  }
} );
