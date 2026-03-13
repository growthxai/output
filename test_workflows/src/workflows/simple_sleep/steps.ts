import { step, z } from '@outputai/core';
import { processUrlOutputSchema } from './types.js';

export const processUrl = step( {
  name: 'processUrl',
  description: 'Process a URL (simulates an API call with logging)',
  inputSchema: z.string().url(),
  outputSchema: processUrlOutputSchema,
  fn: async url => {
    console.log( `Processing URL: ${url}` );
    return { url, timestamp: Date.now() };
  }
} );
