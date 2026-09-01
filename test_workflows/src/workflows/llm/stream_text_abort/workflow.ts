import { workflow } from '@outputai/core';
import { abortStream } from './steps.js';
import { workflowOutputSchema } from './types.js';

export default workflow( {
  name: 'stream_text_abort',
  description: 'Aborts an active streamText generation',
  outputSchema: workflowOutputSchema,
  fn: async () => abortStream()
} );
