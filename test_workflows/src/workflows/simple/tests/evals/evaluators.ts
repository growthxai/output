import { verify, Verdict } from '@outputai/evals';
import { z } from '@outputai/core';

export const evaluateSum = verify(
  {
    name: 'evaluate_sum',
    input: z.object( { values: z.array( z.number() ) } ),
    output: z.object( { result: z.number() } )
  },
  ( { input, output } ) =>
    Verdict.equals( output.result, input.values.reduce( ( a, b ) => a + b, 0 ) )
);
