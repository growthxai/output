import { workflow, z } from '@outputai/core';
import { explainTopic, generateChoice, generateCookingInstruction, generateDrawingInstructions } from './steps.js';

export default workflow( {
  name: 'prompt',
  description: 'A workflow to demonstrate the prompt feature',
  inputSchema: z.object( {
    topic: z.string()
  } ),
  outputSchema: z.object( {
    text: z.string(),
    drawingInstructions: z.array(
      z.object( {
        title: z.string(),
        instruction: z.string()
      } )
    ),
    cookingInstructions: z.object( {
      ingredients: z.array( z.string() ),
      steps: z.array( z.string() ),
      introduction: z.string(),
      observations: z.string()
    } ),
    choice: z.string()
  } ),
  fn: async ( { topic } ) => {
    const text = await explainTopic( { topic } );
    const cookingInstructions = await generateCookingInstruction( { receipt: topic } );
    const drawingInstructions = await generateDrawingInstructions( { topic } );
    const choice = await generateChoice( { topic } );

    return { text, cookingInstructions, drawingInstructions, choice };
  }
} );
