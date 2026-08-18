import { step } from '@outputai/core';
import { generateTextWithStreaming } from '@outputai/llm';
import { workflowInputSchema, workflowOutputSchema } from './types.js';

export const generateStreamedContent = step( {
  name: 'generateStreamedContent',
  description: 'Generates a completed response over streaming transport',
  inputSchema: workflowInputSchema,
  outputSchema: workflowOutputSchema,
  fn: async ( { topic } ) => {
    const chunks: string[] = [];
    const response = await generateTextWithStreaming( {
      prompt: 'stream_content@v1',
      variables: { topic },
      onChunk( { chunk } ) {
        if ( chunk.type === 'text-delta' ) {
          chunks.push( chunk.text );
        }
      }
    } );
    const streamedContent = chunks.join( '' );

    return {
      content: response.result,
      streamedContent,
      chunkCount: chunks.length,
      matches: response.result === streamedContent
    };
  }
} );
