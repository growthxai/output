import { step, z } from '@outputai/core';
import { generateText } from '@outputai/core/llm';
import { searchResultSchema } from './types.js';

const inputSchema = z.object( {
  query: z.string()
} );

export const searchWithAnthropic = step( {
  name: 'searchWithAnthropic',
  description: 'Search the web with Anthropic native web search',
  inputSchema,
  outputSchema: searchResultSchema,
  fn: async ( { query } ) => {
    const response = await generateText( {
      prompt: 'anthropic_search@v1',
      variables: { query },
      toolChoice: 'required'
    } );

    return {
      answer: response.result,
      sources: response.sources
        .filter( source => source.sourceType === 'url' )
        .map( source => ( {
          url: source.url,
          title: source.title ?? ''
        } ) )
    };
  }
} );

export const searchWithOpenAI = step( {
  name: 'searchWithOpenAI',
  description: 'Search the web with OpenAI native web search',
  inputSchema,
  outputSchema: searchResultSchema,
  fn: async ( { query } ) => {
    const response = await generateText( {
      prompt: 'openai_search@v1',
      variables: { query },
      toolChoice: 'required'
    } );

    return {
      answer: response.result,
      sources: response.sources
        .filter( source => source.sourceType === 'url' )
        .map( source => ( {
          url: source.url,
          title: source.title ?? ''
        } ) )
    };
  }
} );
