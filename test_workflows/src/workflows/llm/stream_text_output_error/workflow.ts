import { workflow } from '@outputai/core';
import { streamInvalidOutput } from './steps.js';
import { workflowOutputSchema } from './types.js';

export default workflow( {
  name: 'stream_text_output_error',
  description: 'streamText must bill usage and cost when the structured output never validates',
  outputSchema: workflowOutputSchema,
  fn: async () => streamInvalidOutput()
} );
