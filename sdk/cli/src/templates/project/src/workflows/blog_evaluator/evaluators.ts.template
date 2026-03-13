import { evaluator, EvaluationNumberResult } from '@outputai/core';
import type { EvaluationResultArgs } from '@outputai/core';
import { generateText, Output } from '@outputai/llm';
import { blogContentSchema } from './types.js';
import type { BlogContent } from './types.js';

export const evaluateSignalToNoise = evaluator( {
  name: 'evaluate_signal_to_noise',
  description: 'Evaluate the signal-to-noise ratio of blog content',
  inputSchema: blogContentSchema,
  fn: async ( input: BlogContent ) => {
    const { output } = await generateText( {
      prompt: 'signal_noise@v1',
      variables: {
        title: input.title,
        content: input.content
      },
      output: Output.object( { schema: EvaluationNumberResult.schema } )
    } );

    return new EvaluationNumberResult( output as EvaluationResultArgs<number> );
  }
} );
