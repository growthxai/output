import { step, z } from '@outputai/core';
import { aiSdk, generateTextWithStreaming } from '@outputai/llm';

const impossibleOutputSchema = z.object( {
  answer: z.string().refine( () => false, 'This schema is intentionally impossible to satisfy.' )
} );

/**
 * Same failure as invalid_schema, but over the streaming transport: the stream is drained first, so
 * the output only fails to validate after every lifecycle event already reported its usage.
 */
export const generateStreamedInvalidSchemaOutput = step( {
  name: 'generateStreamedInvalidSchemaOutput',
  description: 'Forces an output validation failure on a streamed generation',
  outputSchema: impossibleOutputSchema,
  fn: async () => {
    const { output } = await generateTextWithStreaming( {
      prompt: 'streaming_invalid_schema@v1',
      output: aiSdk.Output.object( { schema: impossibleOutputSchema } )
    } );

    return output;
  }
} );
