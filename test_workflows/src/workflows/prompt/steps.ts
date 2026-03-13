import { step, z } from '@outputai/core';
import { generateText, Output } from '@outputai/llm';

export const explainTopic = step( {
  name: 'explainTopic',
  description: 'Generates text using a prompt',
  inputSchema: z.object( {
    topic: z.string()
  } ),
  outputSchema: z.string(),
  fn: async ( { topic } ) => {
    // example of grabbing the full response instead of deconstructing the results
    const response = await generateText( {
      prompt: 'prompt@v1',
      variables: { topic }
    } );

    return response.result;
  }
} );

const cookOutputSchema = z.object( {
  ingredients: z.array( z.string() ),
  steps: z.array( z.string() ),
  introduction: z.string(),
  observations: z.string()
} );
export const generateCookingInstruction = step( {
  name: 'generateCookingInstruction',
  description: 'Generates object using a prompt',
  inputSchema: z.object( {
    receipt: z.string()
  } ),
  outputSchema: cookOutputSchema,
  fn: async ( { receipt } ) => {
    const { output } = await generateText( {
      prompt: 'cooking_instructions@v1',
      variables: { receipt },
      output: Output.object( { schema: cookOutputSchema } )
    } );
    return output;
  }
} );

const drawingOutputSchema = z.object( {
  title: z.string(),
  instruction: z.string()
} );

export const generateDrawingInstructions = step( {
  name: 'generateDrawingInstructions',
  description: 'Generates array using a prompt',
  inputSchema: z.object( {
    topic: z.string()
  } ),
  outputSchema: z.array( drawingOutputSchema ),
  fn: async ( { topic } ) => {
    const { output } = await generateText( {
      prompt: 'draw_instructions@v1',
      variables: { topic },
      output: Output.array( { element: drawingOutputSchema } )
    } );
    return output;
  }
} );

export const generateChoice = step( {
  name: 'generateChoice',
  description: 'Generates value from enum using a prompt',
  inputSchema: z.object( {
    topic: z.string()
  } ),
  outputSchema: z.string(),
  fn: async ( { topic } ) => {
    const { output } = await generateText( {
      prompt: 'choice@v1',
      variables: { topic },
      output: Output.choice( { options: [ 'yes', 'no' ] } )
    } );
    return output;
  }
} );
