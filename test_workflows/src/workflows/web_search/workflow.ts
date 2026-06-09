import { workflow, z } from '@outputai/core';
import { searchWeb } from './steps.js';
import { searchOutputSchema } from './types.js';

export default workflow( {
  name: 'web_search',
  description: 'Search the web using Perplexity search tool via Claude and return an answer with sources',
  inputSchema: z.object( {
    query: z.string()
  } ),
  outputSchema: searchOutputSchema,
  fn: async ( { query } ) => {
    return searchWeb( { query } );
  }
} );
