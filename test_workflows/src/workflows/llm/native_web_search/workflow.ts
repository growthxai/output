import { workflow, z } from '@outputai/core';
import { searchWithAnthropic, searchWithOpenAI, searchWithOpenAIPreview } from './steps.js';
import { nativeWebSearchOutputSchema } from './types.js';

export default workflow( {
  name: 'native_web_search',
  description: 'Compare Anthropic and OpenAI native web search with metered provider tool costs',
  inputSchema: z.object( {
    query: z.string()
  } ),
  outputSchema: nativeWebSearchOutputSchema,
  fn: async ( { query } ) => {
    const anthropic = await searchWithAnthropic( { query } );
    const openai = await searchWithOpenAI( { query } );
    const openaiPreview = await searchWithOpenAIPreview( { query } );

    return { anthropic, openai, openaiPreview };
  }
} );
