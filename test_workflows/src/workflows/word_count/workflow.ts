import { workflow, z } from '@outputai/core';
import { countWords } from './steps.js';

export default workflow( {
  name: 'word_count',
  description: 'Count the words in a text, with an eval suite covering shared evaluators, feedback and evaluator errors',
  inputSchema: z.object( {
    text: z.string()
  } ),
  outputSchema: z.object( {
    words: z.number()
  } ),
  fn: async input => ( { words: await countWords( input.text ) } )
} );
