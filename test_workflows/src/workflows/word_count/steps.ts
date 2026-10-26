import { step, z } from '@outputai/core';

export const countWords = step( {
  name: 'countWords',
  description: 'Count the words in a text',
  inputSchema: z.string(),
  outputSchema: z.number(),
  fn: async text => text.split( /\s+/ ).filter( Boolean ).length
} );
