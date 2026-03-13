import { workflow, sleep } from '@outputai/core';
import { workflowInputSchema, workflowOutputSchema } from './types.js';
import { processUrl } from './steps.js';

export default workflow( {
  name: 'simple_sleep',
  description: 'Demonstrates sleep-based throttling when processing URLs',
  inputSchema: workflowInputSchema,
  outputSchema: workflowOutputSchema,
  fn: async input => {
    for ( const url of input.urls ) {
      await sleep( input.delayMs );
      await processUrl( url );
    }

    return { processed: input.urls.length };
  }
} );
