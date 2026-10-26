import { verify, Verdict } from '@outputai/core/evals';

export const outputPresent = verify(
  { name: 'output_present' },
  ( { output } ) => Verdict.isTrue( output !== undefined && output !== null )
);
