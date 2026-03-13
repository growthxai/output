import { step } from '@outputai/core';
import { streamText } from '@outputai/llm';
import { workflowInputSchema, workflowOutputSchema } from './types.js';

export const generateStreamedContent = step( {
  name: 'generateStreamedContent',
  description: 'Streams text generation and returns the collected result',
  inputSchema: workflowInputSchema,
  outputSchema: workflowOutputSchema,
  fn: async ( { topic } ) => {
    const result = streamText( {
      prompt: 'stream_content@v1',
      variables: { topic }
    } );

    const chunks: string[] = [];
    for await ( const chunk of result.textStream ) {
      chunks.push( chunk );
    }

    const content = chunks.join( '' );
    return {
      content,
      chunkCount: chunks.length,
      avgChunkSize: Math.round( content.length / chunks.length )
    };
  }
} );
