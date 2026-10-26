import { FatalError, z } from '@outputai/core';
import { verify, Verdict } from '@outputai/core/evals';

const textInput = z.object( { text: z.string() } );
const countOutput = z.object( { words: z.number() } );

export const evaluateCount = verify(
  { name: 'evaluate_count', input: textInput, output: countOutput },
  ( { input, output } ) => {
    const expected = input.text.split( /\s+/ ).filter( Boolean ).length;
    if ( output.words === expected ) {
      return Verdict.pass();
    }

    const feedback = [ {
      issue: `Expected ${expected} words, got ${output.words}`,
      suggestion: 'Split on any whitespace and ignore empty tokens',
      priority: 'high' as const
    } ];
    if ( Math.abs( output.words - expected ) === 1 ) {
      return Verdict.partial( 0.5, 'Word count is off by one', feedback );
    }
    return Verdict.fail( 'Word count is wrong', feedback );
  }
);

export const crashOnRequest = verify(
  { name: 'crash_on_request', input: textInput, output: countOutput },
  ( { context } ) => {
    if ( context.ground_truth.crash ) {
      throw new FatalError( 'Evaluator crashed on purpose' );
    }
    return Verdict.isTrue( true );
  }
);
