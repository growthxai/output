import { evaluator, z, EvaluationBooleanResult } from '@outputai/core';

export const evaluateGibberish = evaluator( {
  name: 'evaluate_gibberish',
  description: 'Check if a given string is gibberish',
  inputSchema: z.string(),
  fn: async content => {
    return new EvaluationBooleanResult( {
      value: ![ 'foo', 'bar' ].includes( content ),
      confidence: 0.95
    } );
  }
} );

export const evaluateCompleteness = evaluator( {
  name: 'evaluate_completeness',
  description: 'Check if a given string is complete',
  inputSchema: z.string(),
  fn: async content => {
    return new EvaluationBooleanResult( {
      value: content.length > 10,
      confidence: 1,
      reasoning: 'Seems legit to me'
    } );
  }
} );
