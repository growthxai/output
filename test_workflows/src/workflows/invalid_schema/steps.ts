import { step, z } from '@outputai/core';
import { generateText, Output } from '@outputai/llm';

const impossibleOutputSchema = z.object( {
  answer: z.string().refine( () => false, 'This schema is intentionally impossible to satisfy.' )
} );

export const generateInvalidSchemaOutput = step( {
  name: 'generateInvalidSchemaOutput',
  description: 'Forces an AI SDK structured output validation failure',
  outputSchema: impossibleOutputSchema,
  fn: async () => {
    const { output } = await generateText( {
      prompt: 'invalid_schema@v1',
      output: Output.object( { schema: impossibleOutputSchema } )
    } );

    return output;
  }
} );
