import { workflow } from '@outputai/core';
import { abortStreamAfterStep } from './steps.js';
import { workflowOutputSchema } from './types.js';

export default workflow( {
  name: 'stream_text_abort_after_step',
  description: 'streamText aborted after a step finished must still bill that step usage and cost',
  outputSchema: workflowOutputSchema,
  fn: async () => abortStreamAfterStep()
} );
