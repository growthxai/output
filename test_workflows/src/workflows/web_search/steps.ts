import { step, z } from '@outputai/core';
import { generateText, perplexitySearch, stepCountIs } from '@outputai/llm';
import { searchOutputSchema } from './types.js';

export const searchWeb = step( {
  name: 'searchWeb',
  description: 'Search the web using Perplexity search tool',
  inputSchema: z.object( { query: z.string() } ),
  outputSchema: searchOutputSchema,
  fn: async ( { query } ) => {
    const response = await generateText( {
      prompt: 'web_search@v1',
      variables: { query },
      tools: {
        search: perplexitySearch()
      },
      stopWhen: stepCountIs( 3 )
    } );

    return {
      answer: response.result,
      sources: ( response.sources ?? [] )
        .filter( s => s.sourceType === 'url' )
        .map( s => ( { url: s.url, title: s.title ?? '' } ) )
    };
  }
} );
