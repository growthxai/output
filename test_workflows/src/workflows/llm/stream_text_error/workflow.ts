import { workflow } from '@outputai/core';
import { workflowOutputSchema } from './types.js';
import { streamMissingModel } from './steps.js';

export default workflow( {
  name: 'stream_text_error',
  description: 'streamText failures must not surface as AI_NoOutputGeneratedError',
  outputSchema: workflowOutputSchema,
  fn: async () => streamMissingModel()
} );
