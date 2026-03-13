import { workflow, z } from '@outputai/core';
import { evaluateGibberish, evaluateCompleteness } from './evaluators.js';

export default workflow( {
  name: 'evaluation',
  description: 'A workflow to test evaluations',
  outputSchema: z.boolean(),
  fn: async () => {
    const string = 'John Bigboote';
    const gibberishResult = await evaluateGibberish( string );
    const completenessResult = await evaluateCompleteness( string );
    return gibberishResult.value && completenessResult.value;
  }
} );
