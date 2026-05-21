import { workflow, z } from '@outputai/core';
import { answerFromDocument } from './steps.js';

const answerSchema = z.object( {
  question: z.string(),
  answer: z.string(),
  cacheReadInputTokens: z.number().optional(),
  cacheCreationInputTokens: z.number().optional()
} );

export default workflow( {
  name: 'prompt_caching_demo',
  description: 'Asks two questions about the same document so the second call hits Anthropic prompt cache.',
  inputSchema: z.object( {
    document: z.string(),
    questions: z.array( z.string() ).min( 1 )
  } ),
  outputSchema: z.object( {
    answers: z.array( answerSchema )
  } ),
  fn: async ( { document, questions } ) => {
    const answers = [];
    for ( const question of questions ) {
      answers.push( await answerFromDocument( { document, question } ) );
    }
    return { answers };
  }
} );
