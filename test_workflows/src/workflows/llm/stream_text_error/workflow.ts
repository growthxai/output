import { workflow } from '@outputai/core';
import { workflowOutputSchema } from './types.js';
import { streamMissingModel } from './steps.js';

export default workflow( {
  name: 'stream_text_error',
  description: 'streamText onError must surface the provider error, not AI_NoOutputGeneratedError',
  outputSchema: workflowOutputSchema,
  fn: async () => streamMissingModel()
} );
