import { workflow, z } from '@outputai/core';
import { sumValues } from './steps.js';

const helper = async ( input : number[] ) : Promise<number> => {
  const sum = await sumValues( input );
  return sum;
};

export default workflow( {
  name: 'helper_fn',
  description: 'A workflow with helper functions and no trace',
  inputSchema: z.object( {
    values: z.array( z.number() )
  } ),
  outputSchema: z.object( {
    result: z.number()
  } ),
  fn: async input => {
    const result = await helper( input.values );
    return { result };
  },
  options: {
    activityOptions: {
      retry: {
        maximumAttempts: 99
      }
    },
    disableTrace: true
  }
} );
